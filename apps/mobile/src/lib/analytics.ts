import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

import { ANALYTICS_DEFAULT_ON, ANALYTICS_ENABLED } from './flags';
import { getInstallId } from './installId';
import { supabase } from './supabase';

// Usage counts, so we can see which parts of the app get used. Rules this file keeps:
//  - Nothing is recorded unless the person has switched it on in Settings (or the default in flags.ts is on and they
//    have not switched it off). Turning it off stops collection at once.
//  - Only the event names listed below are ever sent, with a random per-install id. Never a name, email, allergy,
//    diet, food note, recipe, price, or anything typed. Adding an event means adding its name here and to the privacy policy.
//  - Rows go to experiment_events in Supabase (the same database as the account), linked to the account only so they are
//    deleted with it. The table itself only accepts these names (migration 20261116000500). No analytics company is involved, there is no advertising id, and nothing is shared or sold.
//  - Someone who is not signed in has no account to attach events to, so nothing is recorded for them.
export const ANALYTICS_EVENTS = ['app_opened', 'plan_generated', 'grocery_list_built'] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const KEY = 'kelmi.analytics';
const listeners = new Set<(on: boolean) => void>();
let enabled = ANALYTICS_ENABLED && ANALYTICS_DEFAULT_ON;
let loaded = false;
// Events wait for the saved choice to be read, so an early event (the app opening) is not decided on the default.
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

// Called once at launch: reads the person's saved choice. Until it has been read, nothing is recorded.
export function startAnalytics() {
  if (!ANALYTICS_ENABLED) return;
  AsyncStorage.getItem(KEY)
    .then((saved) => {
      if (saved === 'on' || saved === 'off') enabled = saved === 'on';
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      markReady();
      listeners.forEach((l) => l(enabled));
    });
}

export const analyticsOn = () => ANALYTICS_ENABLED && loaded && enabled;

export function setAnalyticsEnabled(on: boolean) {
  enabled = on;
  loaded = true;
  markReady();
  listeners.forEach((l) => l(on));
  AsyncStorage.setItem(KEY, on ? 'on' : 'off').catch(() => {});
}

// On sign-out the choice goes back to the default, so the next person to sign in on this phone is never counted under
// someone else's consent.
export function resetAnalytics() {
  enabled = ANALYTICS_ENABLED && ANALYTICS_DEFAULT_ON;
  AsyncStorage.removeItem(KEY).catch(() => {});
  listeners.forEach((l) => l(enabled));
}

export function useAnalyticsEnabled(): boolean {
  const [on, setOn] = useState(enabled);
  useEffect(() => {
    listeners.add(setOn);
    setOn(enabled);
    return () => {
      listeners.delete(setOn);
    };
  }, []);
  return on;
}

// Fire and forget: a lost event must never break the screen.
export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  if (!ANALYTICS_ENABLED || !supabase) return;
  await ready;
  if (!analyticsOn()) return;
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(event)) return;
  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;
    await supabase.from('experiment_events').insert({
      user_id: userId,
      install_id: await getInstallId(),
      experiment: 'app',
      variant: 'all',
      event,
    });
  } catch {}
}
