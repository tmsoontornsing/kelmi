# Migration notes

Apply in this order (`supabase db push` when you are ready; nothing has been applied). Each file is a new migration after 20261109000000.

| # | File | What it does | Grants / policies changed |
|---|------|--------------|---------------------------|
| 1 | 20261110000000_plan_claims.sql | `plan_generations.status`; `claim_plan_generation` (advisory lock, burst 5/10 min, free 3 and Plus 40 a month, a failed plan counts toward the month only if it used paid tokens (`input_tokens > 0`), and a global ceiling of 2000 AI calls a day that answers `busy`, which generate-plan turns into a 503); `record_generation_result`; `replace_meal_plan` (one-transaction swap, keeps the meal_plans row, drops the week's grocery list) | **Yes.** Drops the insert and update policies on plan_generations and revokes insert/update/delete from anon and authenticated. The three functions are executable by service_role only. |
| 2 | 20261111000000_grocery_hardening.sql | recipe_edits.factors cleaned and CHECKed; `edit_factor` safe cast; grocery_items deduped plus unique (list_id, ingredient_id); `rebuild_grocery_list` locks the plan row; `apply_grocery_choices` (one call for the 21 updates and the rebuild); 11 missing indexes | Grants execute on `apply_grocery_choices` to authenticated. |
| 3 | 20261112000000_input_limits.sql | CHECKs on profiles lists and diet, pantry name, recipe_edits.steps, experiment_events text; pantry quota trigger (200 max; the free limit is 200 too while Plus is not live, see below); experiment_events 500/day trigger (drops extras silently); `user_is_plus()` | Grants execute on `user_is_plus` to authenticated, service_role. |
| 4 | 20261113000000_consent.sql | age_confirmed_at, ai_consent_at, allergy_ack_at; trigger rejecting direct writes to them and to terms_accepted_at/terms_version by anon/authenticated; `record_consent(p_kind, p_version)` with kinds age, ai, allergy, terms, ai_revoke | **Yes.** `record_consent` executable by authenticated. |
| 5 | 20261114000000_plus_gating.sql | recipe_edits RLS: read/delete own, insert/update need an active subscription | **Yes.** Replaces the "for all" policy. |
| 6 | 20261115000000_waitlist_throttle.sql | waitlist.consent_version; 30/min and 500/hour insert throttle | **Yes.** anon may now insert (email, consent_version). |

Existing rows are cleaned before CHECKs are added: unknown diets become `any`; dislikes, likes and appliances are trimmed to fit; pantry names are de-duplicated on their cut name (row_number per person, an uncut name wins, then the lowest id) and then cut to 80; experiment_events rows with an empty field are deleted and long values cut; bad recipe_edits factors are clamped or reset to `{}`; duplicate grocery_items are removed.

**Allergies are never cut or dropped.** Migration 3 raises an exception (and applies nothing) if any profile has more than 20 allergies or an allergy entry longer than 40 characters, and says how many profiles. In that case look at those rows by hand, fix them, and run it again. Only control characters and empty entries are cleaned from allergies.

## Things to know before applying

- **Free pantry limit.** While Plus is not live there is no way to pay, so the database free limit equals the maximum (200), like the app. It lives in `c_free` in `pantry_quota()` in 20261112000000_input_limits.sql. It must become 20 (with `FREE_PANTRY_LIMIT` in the app) in the SAME release as `PLUS_ENABLED=true`, through a new migration that replaces the function.
- **Deploy window (planning breaks).** Migration 1 revokes the caller's insert on plan_generations, and the OLD generate-plan function inserts as the caller. Between `supabase db push` and `supabase functions deploy generate-plan` planning fails for everyone. Do both back to back (push, then deploy all four functions at once). The reverse order does not work either: the new function needs the new database functions.
- **Old app builds and `age_required`.** generate-plan now refuses a profile with no `age_confirmed_at`, and only the new app build calls `record_consent('age')`. People on an old build get `age_required` when they plan until they update. Ship the new app build first (it works before the migrations: it skips consent while the columns are missing), or accept that old builds cannot plan until updated.
- **Daily AI ceiling.** `c_daily_ai_ceiling` (2000) in claim_plan_generation counts today's rows (UTC) that are not the built-in planner or that used tokens. Past it, every new request gets a 503 `busy`, for everyone, until midnight UTC. Keep it in step with `DAILY_AI_CALL_CEILING` in plan-logic.ts (a test checks this). It is a blunt safety net, not per-user fairness.
- **App rule mirrors the server.** `loadPlansThisMonth` in the app ignores failed plans that used no tokens, like the server. If the select policy on plan_generations ever hides `status` or `input_tokens` the count would be wrong; today it reads them.
- **Waitlist.** The website sends `consent_version` (`waitlist-2026-11-05`, constant in apps/web/src/app/api/waitlist/route.ts); change it when the privacy text changes. delete-account removes the waitlist row only when the account's email is confirmed.
- **IDUnify.** `IDUNIFY_BASE_URL` must be https, otherwise generate-plan falls back to the built-in planner and logs it.
- **Recipe import.** `import-recipes.ts` stops before writing if any ingredient would have more than one unit across the file and the recipes already in the database.

## Test locally first (nothing here touches the cloud)

```
supabase start
supabase db reset        # LOCAL database only: replays every migration
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -v ON_ERROR_STOP=1 -f supabase/scripts/smoke-test.sql
```

`supabase/scripts/smoke-test.sql` acts as the `authenticated` role and prints PASS or FAIL for: (a) writing ai_consent_at directly (must be refused), (b) inserting into plan_generations (refused), (c) calling claim_plan_generation (permission denied), (d) `record_consent('age')` (works). It rolls everything back. It passes against a local PGlite Postgres (see below); it has not yet been run on `supabase start`.

### No Docker? Local PGlite check

`supabase/scripts/pg-local-test/` runs every migration (twice for 20261110..15) against PGlite, a Postgres built for WASM, behind a Supabase-like harness, then seeds bad old data and runs about 95 assertions on roles, RLS, consent, plan claims, grocery and limits. See its README (`npm i --no-save @electric-sql/pglite` there). It cannot check real PostgREST/JWT handling or concurrent sessions, so still do the `supabase db reset` run when you can.

Apply the migrations before deploying the functions: generate-plan reads the new consent columns and calls the new functions, and grocery-list calls `apply_grocery_choices`. Do the push and the deploy back to back (see the deploy window above).

## Deploy later (not run)

```
supabase functions deploy generate-plan
supabase functions deploy grocery-list
supabase functions deploy meal-options
supabase functions deploy delete-account
```

`config.toml` sets verify_jwt = false for all four (they verify the token themselves). Optional secrets: ANTHROPIC_API_KEY, IDUNIFY_API_KEY, KAVI_PLAN_PROVIDER (claude, idunify or basic). KAVI_ALLOW_OLLAMA=1 is for local development only.
