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

1. Migrations `20261116000000`, `20261116000100`, `20261116000200`.
2. Edge Functions: `grocery-list` (now calls the 4-argument `apply_grocery_choices` with the service role), `generate-plan`, `gateway`, `delete-account`, `meal-options`, `revenuecat-webhook`. Until this lands, the old grocery-list keeps working through the transitional 3-argument `apply_grocery_choices`, which can add an allergen flag but never clear one, so some meals may sit off the list until step 2. **Drop the 3-argument version in the next migration** once step 2 is live.
3. Website: set `SUPABASE_SERVICE_ROLE_KEY` in Vercel as a **server-only** variable (never `NEXT_PUBLIC_`), then deploy. Set `NEXT_PUBLIC_SITE_URL` if the site is not on usekavi.com. Between step 1 and this, waitlist sign-ups fail.
4. App: a **new native build** (EAS) for `expo-secure-store`. Do not ship this change as an over-the-air update to an older binary: the missing native module crashes the app at start. Bump `runtimeVersion` so EAS Update can't do that by mistake. Older app builds keep working against the new server, except account deletion, which now needs `{confirm:"DELETE"}` and a recent sign-in.

RevenueCat: set `REVENUECAT_SANDBOX_USER_IDS` to the user id of the App Review demo account (and internal testers), comma-separated, so a reviewer's sandbox purchase unlocks Plus. Never set `REVENUECAT_ALLOW_SANDBOX=1` in production.

## Checks only the dashboard can answer

Not visible from the repo. Check each before launch:

- [ ] Each Edge Function's deployed **Verify JWT** setting (all user functions check the token themselves either way).
- [ ] Auth: email confirmation on, anonymous sign-in off, sign-up rate limits and a CAPTCHA (hCaptcha/Turnstile) on. These are what stop account swarms from eating the free AI share.
- [ ] Auth: minimum password length (12+) and leaked-password protection.
- [ ] Whether the platform overwrites `x-forwarded-for` / sets `cf-connecting-ip` for the gateway (log one request). If not, rate limits key on the wrong IP.
- [ ] Decode one access token after a refresh and confirm `amr` holds the original sign-in time (delete-account relies on it).
- [ ] RevenueCat: webhook `Authorization` secret set; sandbox purchases are now ignored unless `REVENUECAT_ALLOW_SANDBOX=1`.
- [ ] Anthropic and IDUnify: a provider-side monthly spend limit.
- [ ] Run Supabase's Security Advisor after the migrations.

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
