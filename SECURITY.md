# Kelmi security

## Threat model in one page

| Asset | Who might want it | Main defence |
|---|---|---|
| Each household's data (allergies, plans, pantry, notes) | Other users, anyone with the gateway URL | Row-level security on every table; Edge Functions read as the caller |
| Allergen safety (what reaches the plan and grocery list) | A user's own mistake, a crafted request, a hostile AI response | Server-side allergy check that fails closed; `meal_plan_items.conflict` writable only by the service role |
| Plus entitlement | Anyone wanting it free | Only the RevenueCat webhook writes `subscriptions`, production events only, applied in order |
| AI spend | Account swarms, retries, timeouts | `claim_plan_generation` caps per user, per month and per day (counted by paid attempts), Plus reserve, built-in planner fallback |
| Consent record | A user erasing it | Columns written only by `record_consent()`; profiles cannot be deleted by users |
| Waitlist emails | Scrapers, spammers | Only `join_waitlist()` (service role) can write it; same answer for new and existing emails |
| Session tokens on the phone | Device backups, other apps | Encrypted at rest (`apps/mobile/src/lib/secureStorage.ts`), key in the Keychain/Keystore |

Every function that reads data (not only the AI one) has a per-person rate limit: `generate-plan` through `claim_plan_generation`, `meal-options` and `grocery-list` through `hit_rate_limit` (60 and 30 a minute), plus the gateway's per-IP limit.

Keys: only the gateway holds the anon key; only Edge Functions and the website's waitlist route hold the service-role key. Neither ever ships in the app.

## Red team

`supabase/scripts/redteam/` holds the attacks from the November 2026 run. Each one now asserts the attack is **blocked**, so a regression fails the run. Everything runs locally (PGlite in memory, Deno with `fetch` stubbed); nothing touches a hosted project.

```
cd supabase/scripts/pg-local-test && npm i --no-save @electric-sql/pglite
node run-migrations.mjs && node assertions.mjs && node hazards.mjs
node ../redteam/rls-tampering.mjs     # cross-user reads/writes, squatting, consent erase, allergen flag
node ../redteam/rpc-abuse.mjs         # database functions as anon/authenticated
cd ../redteam && node plan-caps.mjs && NODE_PATH=../pg-local-test/node_modules node waitlist-db.mjs
deno test --no-check --node-modules-dir=manual --deny-net --allow-read --allow-env billing.test.ts
cd ../.. && deno test --no-check -A functions/_shared/ scripts/redteam/prompt-injection.test.ts
deno test --cached-only --allow-env --allow-read --no-check scripts/redteam/gateway.test.ts scripts/redteam/functions.test.ts scripts/redteam/plan-timeout.test.ts
deno test --cached-only --allow-env --allow-read --no-check --import-map=scripts/redteam/import_map.json scripts/redteam/web-waitlist.test.ts
```

Run them after any change to a migration, RLS policy, Edge Function, or the waitlist route.

## Deploying the November 2026 hardening

Ship in this order, close together:

1. Migrations `20261116000000`, `20261116000100`, `20261116000200`, `20261116000400` (and your `20261116000300` launch-email one). The live project (checked 2026-11-12 with Supabase's read-only advisors) already has data and migrations through `20261115`, so these apply on top of real rows: every new constraint is `NOT VALID`, so old rows never block the deploy.
2. Edge Functions: `grocery-list` (now calls the 4-argument `apply_grocery_choices` with the service role), `generate-plan`, `gateway`, `delete-account`, `meal-options`, `revenuecat-webhook`. Until this lands, the old grocery-list keeps working through the transitional 3-argument `apply_grocery_choices`, which can add an allergen flag but never clear one, so some meals may sit off the list until step 2. **Drop the 3-argument version in the next migration** once step 2 is live.
3. Website: set `SUPABASE_SERVICE_ROLE_KEY` in Vercel as a **server-only** variable (never `NEXT_PUBLIC_`), then deploy. Set `NEXT_PUBLIC_SITE_URL` if the site is not on usekelmi.com. Between step 1 and this, waitlist sign-ups fail.
4. App: a **new native build** (EAS) for `expo-secure-store`. Do not ship this change as an over-the-air update to an older binary: the missing native module crashes the app at start. Bump `runtimeVersion` so EAS Update can't do that by mistake. Older app builds keep working against the new server, except account deletion, which now needs `{confirm:"DELETE"}` and a recent sign-in.

RevenueCat: set `REVENUECAT_SANDBOX_USER_IDS` to the user id of the App Review demo account (and internal testers), comma-separated, so a reviewer's sandbox purchase unlocks Plus. Never set `REVENUECAT_ALLOW_SANDBOX=1` in production.

## Checks only the dashboard can answer

Not visible from the repo. Check each before launch:

- [ ] Each Edge Function's deployed **Verify JWT** setting (all user functions check the token themselves either way).
- [ ] Auth: email confirmation on, anonymous sign-in off, sign-up rate limits and a CAPTCHA (hCaptcha/Turnstile) on. These are what stop account swarms from eating the free AI share.
- [ ] Auth: minimum password length (12+) and **leaked-password protection**. The Security Advisor reports it as *disabled* on the live project; turn it on in Auth > Providers > Email (a Pro-plan feature). I can't change it from the repo.
- [ ] Whether the platform overwrites `x-forwarded-for` / sets `cf-connecting-ip` for the gateway (log one request). If not, rate limits key on the wrong IP.
- [ ] Decode one access token after a refresh and confirm `amr` holds the original sign-in time (delete-account relies on it).
- [ ] RevenueCat: webhook `Authorization` secret set; sandbox purchases are now ignored unless `REVENUECAT_ALLOW_SANDBOX=1`.
- [ ] Sign in with Apple revocation: apply `20261117000000_apple_tokens.sql`, deploy `apple-link` and `delete-account`, and set `APPLE_TEAM_ID`, `APPLE_KEY_ID` and `APPLE_PRIVATE_KEY` (a Sign in with Apple key from Certificates, Identifiers & Profiles > Keys; paste the whole .p8). Set `APPLE_CLIENT_ID` only if the bundle id is not `com.logicbaker.kelmi`. Check: sign in with Apple on a device, confirm a row in `apple_tokens`, delete the account, and Kelmi should leave Settings > Apple ID > Sign in with Apple. Failures log `apple_revoke_failed`.
- [ ] RevenueCat: `REVENUECAT_SECRET_KEY` (a secret `sk_` key) set in Supabase secrets only, so `delete-account` also deletes the person's RevenueCat customer, as the Privacy Policy promises. Check once with a test account; failures log `revenuecat_delete_failed` with the HTTP status (401 = wrong key); remove those customers by hand in the RevenueCat dashboard.
- [ ] Anthropic and IDUnify: a provider-side monthly spend limit.
- [ ] Run Supabase's Security Advisor after the migrations. Before them it listed three trigger functions callable through the API (fixed by `20261116000400`), `record_consent` as callable by signed-in users (intended: it only ever touches the caller's own row), and the password setting above.
- [ ] Budget caps. Put a monthly spend limit on every usage-billed account: Anthropic, IDUnify, Resend, Vercel and Supabase (spend cap or billing alerts). Where a provider has no hard cap, set alerts at 50/80/100% of what you'd tolerate. Server-side limits stop abuse; these limits stop a surprise bill from anything the limits miss.

## Checklist: "Security checks for your AI-built app", part 2 (items 19-36)

Checked against the code on 2026-11-12. "Dashboard" means it can't be seen from the repo.

| # | Check | Status |
|---|---|---|
| 19 | XSS | OK. The only `dangerouslySetInnerHTML` uses are fixed strings (theme script) and `JSON.stringify` of our own JSON-LD; no user text is rendered as HTML. CSP limits the rest (see accepted risks). |
| 20 | CSRF | OK. The app uses bearer tokens, not cookies. The one cookie-less browser POST (`/api/waitlist`) requires an allowed `Origin` and `application/json`. |
| 21 | Insecure file uploads | OK. Users cannot upload anything. The only bucket (`recipe-images`) has no write policy, a 2 MB limit and a JPEG/PNG/WebP allow-list; uploads are service-role scripts. |
| 22 | Path traversal | OK. Gateway `routeFor` rejects dot segments, backslashes, encoded slashes and dots, and only forwards `auth/v1`, `rest/v1` and five named functions (fuzzed in `supabase/scripts/redteam/gateway.test.ts`). |
| 23 | SSRF | OK. No server fetch takes a URL from a user. Provider hosts are pinned (`ai.idunify.com`, `api.anthropic.com`, localhost-only Ollama); the gateway only builds paths on our own project. |
| 24 | Broken password reset | N/A in code: the app has no reset flow, and the callback screen accepts only `signup`/`email` token types, so a `recovery` link cannot sign anyone in through it. Reset email, its expiry and rate limit are Supabase settings (dashboard). **Gap:** people who forget a password have no way back in-app; add one (with a recent-sign-in requirement) before launch, or lean on Apple/Google sign-in. |
| 25 | Weak session management | OK on the phone: tokens encrypted at rest, key in Keychain/Keystore, `persistSession` with refresh, delete-account needs a recent sign-in. Token lifetime and refresh-token reuse detection are dashboard settings (JWT expiry 1 h or less, reuse detection on). |
| 26 | JWT secrets | OK. No JWT is signed or verified by our code: functions call `auth.getUser(token)`. No secret is in the app or the repo (the app holds only the gateway address). If the legacy JWT secret was ever shared, rotate it (dashboard). |
| 27 | Permissive CORS | OK. No function or route sends `Access-Control-Allow-*`, so browsers get no cross-origin access; the native app doesn't need it. Don't add `*` later. |
| 28 | Rate limits | Partly. Per-person database limits on `meal-options` and `grocery-list`, plan caps on AI (`claim_plan_generation`), waitlist route and DB throttle, body caps. The gateway's per-IP limit is best effort (in memory, per instance, skipped when a function is called directly). `delete-account` is guarded by its recent-sign-in check, `app-config` has no limit. Sign-up/OTP throttling is a Supabase Auth setting (dashboard). |
| 29 | Exposed environments | OK in the repo: `.env*` ignored (only `.env.example` tracked), only `EXPO_PUBLIC_*` addresses and Google client IDs ship in the app, service-role key is server-only. Check Vercel preview deployments aren't public with production secrets (dashboard). |
| 30 | Default credentials | OK. No literal passwords, keys or tokens in source (grep). Change any default Supabase/DB passwords from project creation (dashboard). |
| 31 | Unsigned webhooks | OK. `revenuecat-webhook` requires the `Authorization` secret (hashed constant-time compare), refuses to run if it's unset, and ignores sandbox events unless opted in (`REVENUECAT_ALLOW_SANDBOX`, `REVENUECAT_SANDBOX_USER_IDS`). |
| 32 | Front-end payment checks | OK. `isPlus` in the app only changes what the UI shows. Plus limits are enforced server-side by `claim_plan_generation` reading `subscriptions`, which only the signed webhook writes. |
| 33 | IDOR / BOLA | OK. Every table has RLS on `auth.uid()`; ids passed to functions are re-checked against the caller (`apply_grocery_choices` takes the verified user); proven by `supabase/scripts/redteam/rls-tampering.mjs` and `rpc-abuse.mjs`. |
| 34 | APIs + user input | OK. Body size caps, JSON shape checks, allow-listed enums, `unknown_allergy` fails closed, DB check constraints, prompt-injection tests. |
| 35 | Exposed logs | Mostly OK. Function logs hold codes and error messages, no emails, tokens, notes or allergy lists; clients only get "Something went wrong" (`fail()`). Provider error messages in `adapters.ts` are fixed strings or status codes (not re-audited for response bodies; check before adding any). The app has three unguarded `console.warn(..., e)` calls in `AppState.tsx` that run in release builds; they print generic errors and nothing collects them. Keep logs free of personal data. |
| 36 | Exposed source maps | OK. Next.js browser source maps are explicitly off (`next.config.ts`); the app ships as Hermes bytecode. If you upload maps to a crash reporter, upload them privately, never to the site or a public bucket. |

## Known, accepted, or open

- **Re-signup resets the free plan count.** A new account with the same email gets a fresh 3 plans a month. Closing it needs a stable identity (for example a hashed email kept after deletion).
- **A person can add lines to their own grocery list directly.** Self-only; accepted.
- **Account deletion needs a fresh sign-in**, and the app currently asks the person to sign out and back in rather than prompting inline.
- **Allergies outside the app's chip list are refused**, not guessed at (`unknown_allergy`). `apps/mobile/src/lib/allergens.ts` (used for swap and pantry hints) still uses the older matching; the server is the source of truth and re-checks every swap.
- **Website CSP keeps `script-src 'unsafe-inline'`**, because Next.js inlines its own scripts per build. Reason in `apps/web/next.config.ts`.
- **The website now holds the service-role key** (only inside the waitlist route) so it can call `join_waitlist()`. The narrower alternative is granting `join_waitlist` to `anon` (it validates and dedupes itself) and keeping only the anon key on Vercel, at the cost of letting anyone call it directly. Decide which you prefer.
- **`IDUNIFY_BASE_URL` must be on `ai.idunify.com`.** Any other host silently falls back to the built-in planner; add it to `IDUNIFY_HOSTS` in `adapters.ts` if the real secret differs.
- **Gateway rate limit is per instance and in memory.** A distributed attacker can still fill the waitlist's database throttle; add Turnstile if that happens.

## Reporting a problem

Email the contact address in `apps/mobile/src/legal/config.ts` (still a `[CONTACT EMAIL]` placeholder; fill it in before launch). Please don't test against production.
