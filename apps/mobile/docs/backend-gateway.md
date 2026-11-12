# Keeping keys out of the app: the gateway

The app no longer ships the Supabase anon key or RevenueCat's SDK key. The only service value in the app is the
**gateway address**. The two things that make this work live in `supabase/functions/`.

## What each piece does

- **`gateway`** forwards the app's requests to the project (Auth, the database API, and the few Edge Functions the app
  calls), adding the anon key on the server. The app's Supabase client is pointed at it (`src/lib/supabase.ts`) and sends a
  placeholder where the key would go. Rules and tests: `_shared/gateway.ts`, `_shared/gateway.test.ts`.
- **`app-config`** hands RevenueCat's SDK key to a **signed-in** user (`src/lib/purchases.ts` asks for it the first time
  purchases are needed). Signed-out users get nothing.

Google's two client IDs stay in the app. Native Google sign-in cannot start without them, and the iOS one is written into
the app's Info.plist at build time. They only identify the app to Google; there is nothing secret about them.

## What this does and does not protect

- It does: keep the keys out of the download, the JavaScript bundle and the build's environment variables.
- It does not: make the data more private. A request through the gateway can do exactly what the anon key could do, and
  row-level security still decides what that is. The gateway address is public, like any API address.
- It costs: one extra hop per request, so a little more latency, and every request is also an Edge Function invocation
  (counted against the project's plan). Auth rate limits at the project now see the gateway unless the person's address is
  forwarded, which the gateway does with `x-forwarded-for`; if sign-in starts hitting "too many requests" for everyone, check
  that first.

## Setting it up

1. Set the RevenueCat keys as project secrets (never commit them):
   ```
   supabase secrets set REVENUECAT_IOS_KEY=appl_... --project-ref <project-ref>
   supabase secrets set REVENUECAT_ANDROID_KEY=goog_... --project-ref <project-ref>
   ```
2. Deploy the functions. The gateway must skip the platform's JWT check, because the app has no key to send (this is in
   `supabase/config.toml`, and the flag makes it explicit):
   ```
   supabase functions deploy gateway --no-verify-jwt --project-ref <project-ref>
   supabase functions deploy app-config --no-verify-jwt --project-ref <project-ref>
   ```
3. In the app's `.env` (and the EAS project's environment variables for cloud builds) set only
   `EXPO_PUBLIC_GATEWAY_URL=https://<project-ref>.supabase.co/functions/v1/gateway`, and remove
   `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY` and the `EXPO_PUBLIC_REVENUECAT_*` values.
4. Rebuild. Existing sessions survive, because the client's storage key comes from the project's host name.

## Limits

- Realtime and Storage are not forwarded (the app uses neither). Adding either means extending the gateway, and a function
  cannot proxy websockets.
- New Edge Functions the app should call have to be added to `ALLOWED_FUNCTIONS` in `_shared/gateway.ts`.
- Email links (confirm, reset) and the Google browser sign-in still return through the project's own address; those are
  opened in a browser, not by the app, and do not need the gateway.
