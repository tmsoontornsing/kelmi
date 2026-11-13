import { useEffect, useState } from 'react';

import { analyticsOn } from './analytics';
import { EXPERIMENTS_ENABLED } from './flags';
import { getInstallId } from './installId';
import { supabase } from './supabase';

// A/B tests. A device is put in one variant per experiment, once, by hashing a random id kept on the device, so the
// same person always sees the same version and no server call is needed to decide. Events go to experiment_events in
// Supabase (see its migration for a query that turns them into results). Add an experiment here, read it with
// useExperiment, and record what matters with track.

export const EXPERIMENTS = {
  // Which plan is pre-selected on the paywall. The prices and the plans offered do not change.
  paywall_default_plan: ['annual', 'monthly'],
} as const;

export type ExperimentName = keyof typeof EXPERIMENTS;
export type Variant<E extends ExperimentName> = (typeof EXPERIMENTS)[E][number];

// FNV-1a, so the same id and experiment always give the same number.
export function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Naming the experiment in the hash gives each experiment its own split, so being in the first variant of one test
// says nothing about the next.
export function assign<E extends ExperimentName>(experiment: E, id: string): Variant<E> {
  const variants = EXPERIMENTS[experiment];
  return variants[hash(`${experiment}:${id}`) % variants.length] as Variant<E>;
}

// The variant for this device, or null for the first moment while the device id loads. Show the original version
// while null, and do not record anything until it is set.
export function useExperiment<E extends ExperimentName>(experiment: E): Variant<E> | null {
  const [variant, setVariant] = useState<Variant<E> | null>(null);
  useEffect(() => {
    // Off: no device id is created or stored, and the screen shows its original version.
    if (!EXPERIMENTS_ENABLED) return;
    let live = true;
    getInstallId().then((id) => live && setVariant(assign(experiment, id)));
    return () => {
      live = false;
    };
  }, [experiment]);
  return variant;
}

// Fire and forget: a lost event must never break the screen. Events from someone who is not signed in are dropped.
export async function track(experiment: ExperimentName, variant: string, event: string): Promise<void> {
  // Off: nothing is collected or sent.
  // Also off unless the person has allowed usage counts in Settings.
  if (!EXPERIMENTS_ENABLED || !analyticsOn() || !supabase) return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('experiment_events').insert({
      user_id: userId,
      install_id: await getInstallId(),
      experiment,
      variant,
      event,
    });
  } catch {}
}
