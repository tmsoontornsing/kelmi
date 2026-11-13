# Usage counts (analytics) with PostHog

What it is: three event names (`app_opened`, `plan_generated`, `grocery_list_built`), no properties, sent to PostHog. Code:
`src/lib/analytics.ts`. Switch: Settings > Usage counts. The SDK is not started, and nothing is sent, unless the person turns the switch on.

## Set it up (one time)
1. Create a free PostHog project at posthog.com (US cloud, or EU cloud if you plan to launch in Europe). Sign the PostHog data processing
   agreement (Settings > Organization > Legal) and, in the project's Settings > Project > IP data capture configuration, switch on "Discard
   client IP data". Also turn off session replay, autocapture and surveys for the project.
2. Copy the project token (starts with `phc_`; it is public by design) and set it where the app is built:
   `npx eas-cli env:create --name EXPO_PUBLIC_POSTHOG_KEY --value phc_... --environment production --visibility plaintext`
   and, for the EU cloud, `EXPO_PUBLIC_POSTHOG_HOST=https://eu.i.posthog.com`. For local runs put both in `apps/mobile/.env`.
3. Make a new native build (EAS): PostHog needs new native modules. Without the token the app has no analytics and hides the switch.
4. Look at the numbers in PostHog > Product analytics: events per day, unique users, and a funnel (`app_opened` > `plan_generated` >
   `grocery_list_built`).

## Rules (keep them, or update the privacy policy first)
- Off unless the person turns it on. `ANALYTICS_DEFAULT_ON` in `src/lib/flags.ts` is `false`. Flip it only after deciding you want
  opt-out instead of opt-in; for the EU/UK, consent before collecting is required, so never.
- Only the names in `ANALYTICS_EVENTS` are sent, with no properties. Never a name, email, allergy, diet, food note, recipe, price or typed
  text. A new event = add it to that list, then to the policy wording in `src/legal/documents.ts` ("Usage counts"), then rebuild the legal
  files: `node scripts/build-legal.mjs`.
- Never call `identify()`, and never turn on autocapture, session replay, surveys or feature flags without a policy change.
- Never add another tracking SDK (Meta, Google Analytics, Firebase Analytics, AppsFlyer, Adjust, Mixpanel, ...) without a policy change, a new
  App Privacy answer, and likely the App Tracking Transparency prompt.
- Because events are not tied to an account, a person's counts cannot be found or deleted by account. The policy says so.

## Store forms (answer these when you submit; check them against Apple's and Google's current wording)
- **App Store Connect > App Privacy.** Usage Data > Product Interaction: collected, not linked to the user, purpose Analytics, not used for
  tracking. Also list Contact Info (email), User ID and the health-related data (allergies, diet) the app already collects.
  "Do you or your third-party partners use data for tracking?": No.
- **Google Play > Data safety.** App activity > App interactions: collected, optional, shared with a service provider (PostHog) for Analytics,
  encrypted in transit. Declare the other data the app already collects.
- Do not add the App Tracking Transparency prompt (`NSUserTrackingUsageDescription`): nothing here tracks across other companies' apps or sites.

## Separate from this: A/B tests
`src/lib/experiments.ts` (off, `EXPERIMENTS_ENABLED = false`) still writes to `experiment_events` in Supabase, only when the same switch is on.
