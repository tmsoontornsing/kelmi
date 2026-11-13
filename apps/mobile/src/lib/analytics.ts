import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import type { PostHog } from 'posthog-react-native';

import { ANALYTICS_DEFAULT_ON, ANALYTICS_ENABLED } from './flags';

// Product analytics with PostHog. Rules this file keeps (change the privacy policy, "Usage counts", before changing any):
//  - Nothing is recorded, and the PostHog SDK is not even started, unless the person has switched it on in Settings (or
//    ANALYTICS_DEFAULT_ON in flags.ts is true and they have not switched it off). Turning it off stops collection at once
//    and throws away the random id PostHog made.
//  - Only the event names listed below are ever sent, with no properties beyond the minimum PostHog needs (its token, the
//    random id, and the library name and version; see KEEP). Never a name, email, allergy, diet, food note,
//    recipe, price, or anything typed. Adding an event means adding its name here and to the privacy policy.
//  - Anonymous: we never call identify(), so events are tied to a random id on the phone, not to an account, email or
//    name. No autocapture, no session replay, no screen recording, no surveys, no feature flags, and GeoIP lookup is off.
//    No advertising id is read and no App Tracking Transparency prompt is needed.
//  - Without EXPO_PUBLIC_POSTHOG_KEY (a public project token, like an anon key) this does nothing and the switch is hidden.
export const ANALYTICS_EVENTS = ['app_opened', 'plan_generated', 'grocery_list_built'] as const;
export type AnalyticsEvent = (typeof ANALYTICS_EVENTS)[number];

const POSTHOG_KEY = process.env.EXPO_PUBLIC_POSTHOG_KEY ?? '';
const POSTHOG_HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';

// Whether analytics exist in this build at all (flag on and a project token set). The Settings switch shows only then.
export const analyticsAvailable = ANALYTICS_ENABLED && POSTHOG_KEY.length > 0;

const KEY = 'kelmi.analytics';
const listeners = new Set<(on: boolean) => void>();
let enabled: boolean = analyticsAvailable && ANALYTICS_DEFAULT_ON;
let loaded = false;
let client: PostHog | null = null;
// Events wait for the saved choice to be read, so an early event (the app opening) is not decided on the default.
let markReady: () => void = () => {};
const ready = new Promise<void>((resolve) => {
  markReady = resolve;
});

// Called once at launch: reads the person's saved choice, then counts the app opening if they have allowed it.
export function startAnalytics() {
  if (!analyticsAvailable) return;
  AsyncStorage.getItem(KEY)
    .then((saved) => {
      if (saved === 'on' || saved === 'off') enabled = saved === 'on';
    })
    .catch(() => {})
    .finally(() => {
      loaded = true;
      markReady();
      listeners.forEach((l) => l(enabled));
      trackEvent('app_opened');
    });
}

export const analyticsOn = () => analyticsAvailable && loaded && enabled;

// The only event properties that leave the phone. PostHog's React Native SDK adds device model, OS version, locale, time zone,
// screen size and app version to every event; none of that is wanted, so everything not listed here is removed before sending.
const KEEP = new Set(['token', 'distinct_id', '$lib', '$lib_version']);

// Started only once collection is allowed, so a person who never opts in never has the SDK running. Created opted out, and
// opted in only after the choice is checked again, so a switch turned off while it loads can never send anything.
async function getClient(): Promise<PostHog | null> {
  if (client) return client;
  try {
    const { PostHog: PostHogClient } = await import('posthog-react-native');
    const c = new PostHogClient(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      defaultOptIn: false,
      captureAppLifecycleEvents: false,
      disableGeoip: true,
      enableSessionReplay: false,
      disableSurveys: true,
      disableRemoteConfig: true,
      disableRemoteFeatureFlags: true,
      preloadFeatureFlags: false,
      sendFeatureFlagEvent: false,
      // Send each event at once (there are only a few a day), so nothing waits in a queue that could outlive an opt-out.
      flushAt: 1,
      flushInterval: 1000,
      before_send: (e) => {
        if (e.properties) for (const k of Object.keys(e.properties)) if (!KEEP.has(k)) delete e.properties[k];
        delete e.$set;
        delete e.$set_once;
        return e;
      },
    });
    if (!analyticsOn()) return null;
    await c.optIn();
    if (!analyticsOn()) {
      await c.optOut();
      return null;
    }
    client = c;
  } catch {
    client = null;
  }
  return client;
}

export function setAnalyticsEnabled(on: boolean) {
  enabled = on && analyticsAvailable;
  loaded = true;
  markReady();
  listeners.forEach((l) => l(enabled));
  AsyncStorage.setItem(KEY, on ? 'on' : 'off').catch(() => {});
  if (!on && client) {
    // Stop at once: forget the random id first, then record the opt-out last so it is the saved state.
    const c = client;
    client = null;
    c.reset();
    c.optOut().catch(() => {});
  }
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
  if (!analyticsAvailable) return;
  await ready;
  if (!analyticsOn()) return;
  if (!(ANALYTICS_EVENTS as readonly string[]).includes(event)) return;
  try {
    const c = await getClient();
    if (c && analyticsOn()) c.capture(event);
  } catch {}
}
