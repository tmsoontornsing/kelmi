# Usage counts (analytics)

What it is: three usage counts (`app_opened`, `plan_generated`, `grocery_list_built`) written to `experiment_events` in our own Supabase
database. Code: `src/lib/analytics.ts`. Switch: Settings > Usage counts. No analytics company, no advertising id, no tracking SDK.

## Rules (keep them, or update the privacy policy first)
- Off unless the person turns it on. `ANALYTICS_DEFAULT_ON` in `src/lib/flags.ts` is `false`. Flip it to `true` only after deciding you
  want opt-out instead of opt-in (the policy text works either way) and, if you ever launch in the EU/UK, never: consent is required there.
- Only the names in `ANALYTICS_EVENTS` are sent. Never a name, email, allergy, diet, food note, recipe, price or typed text.
  A new event = add it to that list, then add it to the policy wording in `src/legal/documents.ts` ("Usage counts"), then rebuild the legal
  files: `node scripts/build-legal.mjs`.
- The table only accepts these names (migration `20261116000500`) and 50 rows a day per account. Old rows are not purged automatically: add a
  scheduled delete (for example older than 90 days) once there is real volume.
- Rows belong to the account (`user_id ... on delete cascade`), so deleting the account deletes them.
- Someone who is not signed in records nothing.
- Never add a tracking SDK (Meta, Google Analytics, Firebase Analytics, AppsFlyer, Adjust, Mixpanel, ...) without a policy change, a new
  App Privacy answer, and likely the App Tracking Transparency prompt.

## Reading the numbers
Service role or the SQL editor only (the app can write but not read):

    select event, count(*) as events, count(distinct user_id) as people
    from experiment_events where experiment = 'app' and created_at > now() - interval '7 days' group by event;

## Store forms (answer these when you submit; check them against Apple's and Google's current wording)
- **App Store Connect > App Privacy.** Usage Data > Product Interaction: collected, linked to the user, purpose Analytics, not used for
  tracking. Also list Contact Info (email), User ID, and the other data the app already collects (health-related data: allergies and diet).
  "Do you or your third-party partners use data for tracking?": No.
- **Google Play > Data safety.** App activity > App interactions: collected, optional, not shared, purpose Analytics, encrypted in transit,
  deletable on request. Declare the other data the app already collects.
- Do not add the App Tracking Transparency prompt (`NSUserTrackingUsageDescription`): nothing here tracks across other companies' apps or sites.
