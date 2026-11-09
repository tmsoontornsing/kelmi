# Local Postgres test for the migrations (no Docker, no cloud)

Runs every file in `supabase/migrations` against PGlite (Postgres compiled to WASM, in memory) behind a small
Supabase-like harness (roles anon / authenticated / service_role, `auth.users`, `auth.uid()`, a stub `storage` schema
and Supabase's default grants). Nothing here touches the network or a hosted project.

```
cd supabase/scripts/pg-local-test
npm i --no-save @electric-sql/pglite     # installs only here (node_modules is git-ignored)
node run-migrations.mjs   # every migration in order, then 20261110..15 a second time (idempotency)
node hazards.mjs          # bad old data seeded before 20261110..15, then checks they are cleaned or refused
node assertions.mjs       # roles, RLS, consent, claim_plan_generation, replace_meal_plan, grocery, limits, waitlist
node smoke.mjs            # ../smoke-test.sql
```

Each script exits non-zero on a failure. `KAVI_MIGRATIONS=/path` points at another migrations folder.

Not covered (PGlite is one in-process session): real PostgREST role switching and JWT parsing, cross-connection
advisory-lock concurrency, the `storage` schema's real policies, and Postgres 15/17 differences (PGlite 0.5 is Postgres 18).
Run `supabase db reset` plus `supabase/scripts/smoke-test.sql` once Docker is available.
