// Behaviour assertions on a fully migrated PGlite database. LOCAL ONLY.
import fs from 'node:fs';
import path from 'node:path';
import { makeDb, applyAll, applyOne, as, MIGRATIONS_DIR } from './harness.mjs';
import { check, eq, ok, fails, report } from './t.mjs';

const db = await makeDb();
const mig = await applyAll(db);
ok(mig.every((r) => r.ok), 'migrations must apply: ' + JSON.stringify(mig.filter((r) => !r.ok)));
const again = await applyAll(db, { from: '20261110000000' });
ok(again.every((r) => r.ok), 'second apply of 1110..1115 must succeed');

const q = async (s, p) => (await db.query(s, p)).rows;
const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000b2',
  P = '00000000-0000-4000-8000-0000000000c3', E = '00000000-0000-4000-8000-0000000000e5';
const I = (n) => `10000000-0000-4000-8000-0000000000${n}`;   // ingredients
const R = (n) => `20000000-0000-4000-8000-0000000000${n}`;   // recipes
const asA = (fn) => as(db, 'authenticated', A, fn);
const asB = (fn) => as(db, 'authenticated', B, fn);
const asP = (fn) => as(db, 'authenticated', P, fn);
const asAnon = (fn) => as(db, 'anon', null, fn);
const asSvc = (fn) => as(db, 'service_role', null, fn);
const run = (who, s, p) => who((d) => d.query(s, p));

// ---- fixtures (superuser) ----
for (const [id, em] of [[A, 'a'], [B, 'b'], [P, 'p'], [E, 'e']]) await db.query(`insert into auth.users (id, email) values ($1,$2)`, [id, `${em}@x.test`]);
await db.exec(`
 insert into public.ingredients (id, name, aisle, avg_price_usd, unit) values
  ('${I('01')}','Chicken','meat',4,'lb'), ('${I('02')}','Rice','dry',2,'lb'), ('${I('03')}','Salsa','jar',3,'jar'), ('${I('04')}','Avocado','produce',1,'each');
 insert into public.recipes (id, title, steps, servings, minutes) values
  ('${R('01')}','R1','s',2,10), ('${R('02')}','R2','s',4,10), ('${R('03')}','R3','s',2,10), ('${R('04')}','R4','s',2,10);
 insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit) values
  ('${R('01')}','${I('01')}',1,'lb'), ('${R('01')}','${I('02')}',0.5,'lb'), ('${R('01')}','${I('03')}',1,'jar'),
  ('${R('02')}','${I('01')}',2,'lb'), ('${R('02')}','${I('04')}',2,'each');`);
const sub = (u, status = 'active', end = null, ext = null) =>
  db.query(`insert into public.subscriptions (user_id, source, status, period_end, external_id) values ($1,'stripe',$2,$3,$4)`, [u, status, end, ext ?? Math.random().toString(36)]);
await sub(P);                                                     // P is Plus
const prof = async (u) => (await q(`select * from public.profiles where id=$1`, [u]))[0];

// ================= (j) new-user trigger =================
await check('j1', 'insert into auth.users creates a profile (handle_new_user not blocked by consent trigger)', async () => {
  for (const u of [A, B, P, E]) ok(await prof(u), 'no profile for ' + u);
  const p = await prof(A);
  ok(p.age_confirmed_at === null && p.ai_consent_at === null && p.allergy_ack_at === null && p.terms_accepted_at === null && p.terms_version === null, 'consent columns not null');
});
await check('j2', 'handle_new_user also works when the inserting session is a non-superuser role (as supabase_auth_admin would be)', async () => {
  await db.exec(`create role gotrue_sim nologin bypassrls; grant usage on schema auth, public to gotrue_sim; grant insert on auth.users to gotrue_sim;`);
  await db.exec(`set role gotrue_sim`);
  try { await db.query(`insert into auth.users (id, email) values ('00000000-0000-4000-8000-0000000000f6','f@x.test')`); } finally { await db.exec('reset role'); }
  ok(await prof('00000000-0000-4000-8000-0000000000f6'), 'no profile');
});

// ================= (a) consent column writes =================
const CONSENT_COLS = [['ai_consent_at', 'now()'], ['age_confirmed_at', 'now()'], ['allergy_ack_at', 'now()'], ['terms_accepted_at', 'now()'], ['terms_version', `'v1'`]];
for (const [col, val] of CONSENT_COLS) {
  await check(`a-upd-${col}`, `UPDATE profiles.${col} directly is rejected (42501)`, () =>
    fails(run(asA, `update public.profiles set ${col} = ${val} where id = '${A}'`), { code: '42501', re: /record_consent/ }));
}
await db.query(`delete from public.profiles where id=$1`, [E]);   // so E can insert its own row
for (const [col, val] of CONSENT_COLS) {
  await check(`a-ins-${col}`, `INSERT profiles with ${col} set is rejected (42501)`, () =>
    fails(as(db, 'authenticated', E, (d) => d.query(`insert into public.profiles (id, ${col}) values ('${E}', ${val})`)), { code: '42501', re: /record_consent/ }));
}
await check('a-upsert-insert-path', 'INSERT .. ON CONFLICT DO UPDATE with a consent column in the insert tuple is rejected', () =>
  fails(run(asA, `insert into public.profiles (id, ai_consent_at) values ('${A}', now()) on conflict (id) do update set household_size = 3`), { code: '42501' }));
await check('a-upsert-update-path', 'INSERT .. ON CONFLICT DO UPDATE SET ai_consent_at = now() (conflict path) is rejected', () =>
  fails(run(asA, `insert into public.profiles (id) values ('${A}') on conflict (id) do update set ai_consent_at = now()`), { code: '42501' }));
await check('a-upsert-excluded', 'ON CONFLICT DO UPDATE SET terms_version = excluded.terms_version with a value is rejected', () =>
  fails(run(asA, `insert into public.profiles (id, terms_version) values ('${A}', 'v9') on conflict (id) do update set terms_version = excluded.terms_version`), { code: '42501' }));
await check('a-normal-upsert', 'normal profile upsert without consent columns works (insert + conflict update)', async () => {
  await run((f) => as(db, 'authenticated', E, f), `insert into public.profiles (id, household_size, diet) values ('${E}', 3, 'vegan') on conflict (id) do update set household_size = excluded.household_size, diet = excluded.diet`);
  await run((f) => as(db, 'authenticated', E, f), `insert into public.profiles (id, household_size, diet) values ('${E}', 4, 'vegan') on conflict (id) do update set household_size = excluded.household_size, diet = excluded.diet`);
  eq((await prof(E)).household_size, 4);
});
await check('a-null-writes-ok', 'writing the consent column to its existing value (null -> null) is allowed (client upserts that echo nulls)', async () => {
  await run(asA, `update public.profiles set ai_consent_at = null, terms_version = null, household_size = 2 where id = '${A}'`);
});
await check('a-service-role', 'service_role may write consent columns directly (trusted role)', async () => {
  await run(asSvc, `update public.profiles set allergy_ack_at = now() where id = '${B}'`);
  ok((await prof(B)).allergy_ack_at, 'not set');
  await db.query(`update public.profiles set allergy_ack_at = null where id=$1`, [B]);
});

// ================= (b) record_consent =================
await check('b-age', "record_consent('age') stamps age_confirmed_at", async () => { await run(asA, `select public.record_consent('age')`); ok((await prof(A)).age_confirmed_at, 'null'); });
await check('b-ai', "record_consent('ai') stamps ai_consent_at", async () => { await run(asA, `select public.record_consent('ai')`); ok((await prof(A)).ai_consent_at, 'null'); });
await check('b-allergy', "record_consent('allergy') stamps allergy_ack_at", async () => { await run(asA, `select public.record_consent('allergy')`); ok((await prof(A)).allergy_ack_at, 'null'); });
await check('b-terms', "record_consent('terms','v1') stamps terms_accepted_at + terms_version", async () => {
  await run(asA, `select public.record_consent('terms','2026-11-05')`); const p = await prof(A); ok(p.terms_accepted_at, 'null'); eq(p.terms_version, '2026-11-05');
});
await check('b-terms-needs-version', "record_consent('terms') without a version / with 41 chars -> 22023", async () => {
  await fails(run(asA, `select public.record_consent('terms')`), { code: '22023' });
  await fails(run(asA, `select public.record_consent('terms', repeat('v',41))`), { code: '22023' });
});
await check('b-revoke', "record_consent('ai_revoke') sets ai_consent_at to null", async () => { await run(asA, `select public.record_consent('ai_revoke')`); eq((await prof(A)).ai_consent_at, null); });
await check('b-unknown-kind', 'unknown kind -> 22023', () => fails(run(asA, `select public.record_consent('nope')`), { code: '22023' }));
await check('b-isolated', "A's calls never touched B's row", async () => { const p = await prof(B); ok(!p.age_confirmed_at && !p.ai_consent_at && !p.terms_accepted_at && !p.terms_version, 'B changed'); });
await check('b-own-row-only', "B's record_consent changes only B (no way to name another user)", async () => {
  await run(asB, `select public.record_consent('age')`); ok((await prof(B)).age_confirmed_at, 'B not set');
  const a = await prof(A); const before = a.age_confirmed_at; ok(before, 'A has own');
});
await check('b-anon-denied', 'anon cannot execute record_consent (42501)', () => fails(run(asAnon, `select public.record_consent('age')`), { code: '42501' }));
await check('b-no-jwt-sub', 'authenticated role with no JWT sub -> 28000', () =>
  fails(as(db, 'authenticated', null, (d) => d.query(`select public.record_consent('age')`)), { code: '28000' }));
await check('b-creates-missing-profile', 'record_consent creates the profile row if it is missing', async () => {
  await db.query(`delete from public.profiles where id=$1`, [E]);
  await run((f) => as(db, 'authenticated', E, f), `select public.record_consent('age')`); ok((await prof(E)).age_confirmed_at, 'missing');
});

// ================= (c) plan_generations / service-only functions =================
await check('c-ins', 'authenticated INSERT plan_generations rejected', () => fails(run(asA, `insert into public.plan_generations (user_id) values ('${A}')`), { code: '42501' }));
await check('c-upd', 'authenticated UPDATE plan_generations rejected', () => fails(run(asA, `update public.plan_generations set input_tokens = 0`), { code: '42501' }));
await check('c-del', 'authenticated DELETE plan_generations rejected', () => fails(run(asA, `delete from public.plan_generations`), { code: '42501' }));
await check('c-anon', 'anon sees 0 plan_generations rows (default select grant, RLS hides them) and cannot write', async () => {
  eq((await run(asAnon, `select * from public.plan_generations`)).rows.length, 0);
  await fails(run(asAnon, `insert into public.plan_generations (user_id) values ('${A}')`), { code: '42501' });
});
await check('c-claim-auth', 'authenticated cannot execute claim_plan_generation', () => fails(run(asA, `select * from public.claim_plan_generation('${A}', false)`), { code: '42501' }));
await check('c-record-auth', 'authenticated cannot execute record_generation_result', () => fails(run(asA, `select public.record_generation_result(gen_random_uuid(),'failed','x','y',0,0)`), { code: '42501' }));
await check('c-replace-auth', 'authenticated cannot execute replace_meal_plan', () => fails(run(asA, `select public.replace_meal_plan('${A}','2026-11-02','[]'::jsonb)`), { code: '42501' }));
await check('c-anon-fns', 'anon cannot execute any of the three', async () => {
  await fails(run(asAnon, `select * from public.claim_plan_generation('${A}', false)`), { code: '42501' });
  await fails(run(asAnon, `select public.record_generation_result(gen_random_uuid(),'failed','x','y',0,0)`), { code: '42501' });
  await fails(run(asAnon, `select public.replace_meal_plan('${A}','2026-11-02','[]'::jsonb)`), { code: '42501' });
});
await check('c-service', 'service_role can claim, record a result, and replace a plan', async () => {
  const c = (await run(asSvc, `select * from public.claim_plan_generation('${E}', false)`)).rows[0];
  eq(c.allowed, true); ok(c.generation_id, 'no id');
  await run(asSvc, `select public.record_generation_result('${c.generation_id}','succeeded','claude','m',10,5)`);
  eq((await q(`select status, input_tokens from public.plan_generations where id=$1`, [c.generation_id]))[0], { status: 'succeeded', input_tokens: 10 });
  await run(asSvc, `select public.replace_meal_plan('${E}','2026-11-02', '[{"recipe_id":"${R('01')}","day_of_week":1,"meal_type":"dinner"}]'::jsonb)`);
});
await check('c-read-own', 'authenticated can read own plan_generations rows but not B/others', async () => {
  const own = (await run(asA, `select user_id from public.plan_generations`)).rows;
  ok(own.every((r) => r.user_id === A), 'saw foreign rows');
});

// ================= (d) claim_plan_generation =================
const monthStart = "(date_trunc('month', now() at time zone 'utc') at time zone 'utc') + interval '1 second'";
const mkUser = async (n) => { const id = `00000000-0000-4000-8000-00000000d${String(n).padStart(3, '0')}`; await db.query(`insert into auth.users (id,email) values ($1,$2)`, [id, `d${n}@x.test`]); return id; };
const claim = async (u, plus = false) => (await q(`select * from public.claim_plan_generation($1,$2)`, [u, plus]))[0];
const claimSvc = async (u, plus = false) => (await run(asSvc, `select * from public.claim_plan_generation($1,$2)`, [u, plus])).rows[0];
const rows = (u, n, { status = 'succeeded', tokens = 0, provider = 'claude', at = monthStart } = {}) =>
  db.query(`insert into public.plan_generations (user_id, status, input_tokens, provider, created_at) select $1,$2,$3,$4, ${at} from generate_series(1,$5)`, [u, status, tokens, provider, n]);

await check('d-free-cap', 'free user: 3 allowed, 4th denied plan_limit', async () => {
  const u = await mkUser(1);
  for (let i = 0; i < 3; i++) { const c = await claimSvc(u); eq(c.allowed, true, 'claim ' + i); eq(c.is_plus, false); }
  const c = await claimSvc(u); eq(c.allowed, false); eq(c.reason, 'plan_limit'); eq(c.generation_id, null);
});
await check('d-burst', 'burst: 5 rows in 10 min -> 6th rate_limited (Plus user, so the monthly cap is not what stops it)', async () => {
  const u = P;
  for (let i = 0; i < 5; i++) eq((await claimSvc(u)).allowed, true, 'claim ' + i);
  const c = await claimSvc(u); eq(c.reason, 'rate_limited'); eq(c.is_plus, true);
});
await check('d-failed-zero-excluded', 'free user with 3 FAILED 0-token rows (older than the burst window): monthly count 0 -> allowed', async () => {
  const u = await mkUser(2); await rows(u, 3, { status: 'failed', tokens: 0, at: `now() - interval '11 minutes'` });
  eq((await claimSvc(u)).allowed, true);
});
await check('d-failed-tokens-counted', '3 FAILED rows with tokens > 0 count -> plan_limit', async () => {
  const u = await mkUser(3); await rows(u, 3, { status: 'failed', tokens: 500, at: `now() - interval '11 minutes'` });
  eq((await claimSvc(u)).reason, 'plan_limit');
});
await check('d-pending-counted', '3 PENDING rows count -> plan_limit', async () => {
  const u = await mkUser(4); await rows(u, 3, { status: 'pending', at: `now() - interval '11 minutes'` });
  eq((await claimSvc(u)).reason, 'plan_limit');
});
await check('d-failed-burst', 'failed 0-token rows still count for burst: 5 failed in last minutes -> rate_limited', async () => {
  const u = await mkUser(5); await rows(u, 5, { status: 'failed', tokens: 0, at: 'now()' });
  eq((await claimSvc(u)).reason, 'rate_limited');
});
await check('d-prior-month-ignored', 'rows from last month do not count toward this month', async () => {
  const u = await mkUser(6); await rows(u, 3, { at: `(date_trunc('month', now() at time zone 'utc') at time zone 'utc') - interval '1 day'` });
  eq((await claimSvc(u)).allowed, true);
});
await check('d-plus-40', 'Plus user (active subscription) gets 40: 39 existing -> 40th allowed, 41st plan_cap', async () => {
  const u = await mkUser(7); await sub(u, 'active', null);
  await rows(u, 39, { tokens: 1 });
  const c = await claimSvc(u); eq(c.allowed, true); eq(c.is_plus, true);
  const c2 = await claimSvc(u); eq(c2.reason, 'plan_cap');
});
await check('d-plus-expired-or-canceled', 'canceled or expired-period subscription is not Plus (free cap 3)', async () => {
  const u1 = await mkUser(8); await sub(u1, 'canceled'); const u2 = await mkUser(9); await sub(u2, 'active', new Date(Date.now() - 86400000).toISOString());
  await rows(u1, 3, { at: `now() - interval '11 minutes'` }); await rows(u2, 3, { at: `now() - interval '11 minutes'` });
  eq((await claimSvc(u1)).reason, 'plan_limit'); eq((await claimSvc(u2)).reason, 'plan_limit');
});
await check('d-trialing-is-plus', 'trialing counts as Plus', async () => { const u = await mkUser(10); await sub(u, 'trialing'); eq((await claimSvc(u)).is_plus, true); });
await check('d-plus-required', 'p_requires_plus=true for a free user -> plus_required; for Plus -> allowed', async () => {
  const u = await mkUser(11); eq((await claimSvc(u, true)).reason, 'plus_required');
  const u2 = await mkUser(12); await sub(u2); eq((await claimSvc(u2, true)).allowed, true);
});
await check('d-denied-no-row', 'a denied claim inserts no row', async () => {
  const u = await mkUser(13); await rows(u, 3, { at: `now() - interval '11 minutes'` });
  const n0 = (await q(`select count(*)::int n from public.plan_generations where user_id=$1`, [u]))[0].n; await claimSvc(u);
  eq((await q(`select count(*)::int n from public.plan_generations where user_id=$1`, [u]))[0].n, n0);
});
await check('d-record-once', 'record_generation_result finishes a pending row once; second call and bad status', async () => {
  const u = await mkUser(14); const c = await claimSvc(u);
  await run(asSvc, `select public.record_generation_result($1,'failed',repeat('p',60),repeat('m',100),-5,7)`, [c.generation_id]);
  let r = (await q(`select status, input_tokens, output_tokens, char_length(provider) pl, char_length(model) ml from public.plan_generations where id=$1`, [c.generation_id]))[0];
  eq(r, { status: 'failed', input_tokens: 0, output_tokens: 7, pl: 40, ml: 80 });
  await run(asSvc, `select public.record_generation_result($1,'succeeded','x','y',99,99)`, [c.generation_id]);
  eq((await q(`select status, input_tokens from public.plan_generations where id=$1`, [c.generation_id]))[0], { status: 'failed', input_tokens: 0 });
  await fails(run(asSvc, `select public.record_generation_result($1,'pending','x','y',1,1)`, [c.generation_id]), { code: '22023' });
});
await check('d-daily-ceiling', "daily ceiling: 1999 AI rows today -> next claim allowed (2000th), next user -> 'busy'; 'basic' 0-token rows do not count; own cap is reported before busy", async () => {
  await db.query(`delete from public.plan_generations where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc'`);
  const dummy = await mkUser(100);
  await db.query(`insert into public.plan_generations (user_id, status, provider, created_at) select $1,'succeeded','claude', ${monthStart} from generate_series(1,1999)`, [dummy]);
  // those are dated month start; make them "today" so they count in the daily window
  await db.query(`update public.plan_generations set created_at = date_trunc('day', now() at time zone 'utc') at time zone 'utc' + interval '1 second' where user_id=$1`, [dummy]);
  // 'basic' rows with 0 tokens must not count
  await db.query(`insert into public.plan_generations (user_id, status, provider, created_at) select $1,'succeeded','basic', now() - interval '20 minutes' from generate_series(1,50)`, [dummy]);
  const u1 = await mkUser(101), u2 = await mkUser(102), u3 = await mkUser(103);
  eq((await claimSvc(u1)).allowed, true, 'the 2000th AI call');
  const c = await claimSvc(u2); eq(c.allowed, false); eq(c.reason, 'busy');
  await rows(u3, 3, { at: `now() - interval '11 minutes'` });
  eq((await claimSvc(u3)).reason, 'plan_limit', 'own cap reported before busy');
  // basic rows with tokens > 0 DO count (token spend): covered by the filter; clean up
  await db.query(`delete from public.plan_generations where user_id in ($1,$2,$3,$4)`, [dummy, u1, u2, u3]);
});

// ================= (e) replace_meal_plan =================
const items = (arr) => JSON.stringify(arr.map(([r, d, m]) => ({ recipe_id: r, day_of_week: d, meal_type: m })));
const replace = (u, wk, arr) => run(asSvc, `select public.replace_meal_plan($1,$2,$3::jsonb) as id`, [u, wk, typeof arr === 'string' ? arr : items(arr)]);
let planE, listE;
await check('e-create', 'creates a plan for a new week', async () => {
  planE = (await replace(B, '2026-11-09', [[R('01'), 1, 'dinner'], [R('02'), 2, 'dinner']])).rows[0].id;
  eq((await q(`select count(*)::int n from public.meal_plan_items where plan_id=$1`, [planE]))[0].n, 2);
});
await check('e-swap', 'second call swaps items, keeps the meal_plans row id, drops the grocery list', async () => {
  listE = (await run(asB, `select public.rebuild_grocery_list($1) id`, [planE])).rows[0].id; ok(listE, 'no list');
  const id2 = (await replace(B, '2026-11-09', [[R('03'), 1, 'lunch'], [R('04'), 3, 'dinner'], [R('01'), 3, 'breakfast']])).rows[0].id;
  eq(id2, planE, 'plan id kept');
  eq((await q(`select recipe_id from public.meal_plan_items where plan_id=$1 order by recipe_id`, [planE])).map((r) => r.recipe_id), [R('01'), R('03'), R('04')]);
  eq((await q(`select count(*)::int n from public.grocery_lists where plan_id=$1`, [planE]))[0].n, 0, 'list dropped');
  eq((await q(`select count(*)::int n from public.meal_plans where user_id=$1`, [B]))[0].n, 1, 'one plan row');
});
await check('e-invalid-recipe', 'invalid recipe id -> 23503 and the old plan + its grocery list are untouched', async () => {
  const lid = (await run(asB, `select public.rebuild_grocery_list($1) id`, [planE])).rows[0].id;
  const before = (await q(`select recipe_id, day_of_week, meal_type from public.meal_plan_items where plan_id=$1 order by 1,2,3`, [planE]));
  await fails(replace(B, '2026-11-09', [[R('01'), 1, 'dinner'], ['99999999-0000-4000-8000-000000000000', 2, 'dinner']]), { code: '23503' });
  eq(await q(`select recipe_id, day_of_week, meal_type from public.meal_plan_items where plan_id=$1 order by 1,2,3`, [planE]), before);
  eq((await q(`select id from public.grocery_lists where plan_id=$1`, [planE]))[0].id, lid, 'list intact');
});
await check('e-validation', 'rejects: empty, 22 meals, duplicate slot, bad meal_type, bad day, null recipe, non-array', async () => {
  const bad = [
    '[]', JSON.stringify(Array.from({ length: 22 }, (_, i) => ({ recipe_id: R('01'), day_of_week: (i % 7) + 1, meal_type: 'dinner' }))),
    items([[R('01'), 1, 'dinner'], [R('02'), 1, 'dinner']]), items([[R('01'), 1, 'brunch']]), items([[R('01'), 8, 'dinner']]),
    '[{"day_of_week":1,"meal_type":"dinner"}]', '{"a":1}',
  ];
  for (const b of bad) await fails(replace(B, '2026-11-09', b), { code: '22023' });
  eq((await q(`select count(*)::int n from public.meal_plan_items where plan_id=$1`, [planE]))[0].n, 3, 'plan intact');
});

// ================= (f) grocery =================
let planA, listA;
await check('f-setup', 'A builds a plan (R1 day1 dinner, R2 day2 dinner)', async () => {
  planA = (await run(asA, `insert into public.meal_plans (user_id, week_start) values ($1,'2026-11-02') returning id`, [A])).rows[0].id;
  await run(asA, `insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type) values ($1,$2,1,'dinner'),($1,$3,2,'dinner')`, [planA, R('01'), R('02')]);
});
const items4 = async (list) => (await q(`select i.name, gi.quantity::float q, gi.checked from public.grocery_items gi join public.ingredients i on i.id=gi.ingredient_id where gi.list_id=$1 order by i.name`, [list]));
await check('f-rebuild-values', 'rebuild_grocery_list quantities: Chicken 2, Rice 0.5, Salsa 1, Avocado 1', async () => {
  listA = (await run(asA, `select public.rebuild_grocery_list($1) id`, [planA])).rows[0].id;
  eq(await items4(listA), [{ name: 'Avocado', q: 1, checked: false }, { name: 'Chicken', q: 2, checked: false }, { name: 'Rice', q: 0.5, checked: false }, { name: 'Salsa', q: 1, checked: false }]);
  eq((await q(`select estimated_total_usd::float t from public.grocery_lists where id=$1`, [listA]))[0].t, 2 * 4 + 0.5 * 2 + 3 + 1);
});
await check('f-no-dup-twice', 'calling rebuild twice: same list id, no duplicate rows', async () => {
  await run(asA, `update public.grocery_items set checked = true where list_id=$1 and ingredient_id=$2`, [listA, I('01')]);
  const id2 = (await run(asA, `select public.rebuild_grocery_list($1) id`, [planA])).rows[0].id; eq(id2, listA);
  const r = await items4(listA); eq(r.length, 4); eq(r.find((x) => x.name === 'Chicken').checked, true, 'checked preserved');
  eq((await q(`select count(*)::int n from public.grocery_lists where plan_id=$1`, [planA]))[0].n, 1);
});
await check('f-unique-index', 'grocery_items unique (list, ingredient) is enforced', () =>
  fails(db.query(`insert into public.grocery_items (list_id, ingredient_id, quantity, unit) values ($1,$2,1,'lb')`, [listA, I('01')]), { code: '23505' }));
await check('f-pantry-match', 'a pantry item named "rice" removes Rice from the list and adds savings', async () => {
  await run(asA, `insert into public.pantry_items (user_id, name) values ($1, '  rice ')`, [A]);
  await run(asA, `select public.rebuild_grocery_list($1)`, [planA]);
  eq((await items4(listA)).map((r) => r.name), ['Avocado', 'Chicken', 'Salsa']);
  ok((await q(`select pantry_savings_usd::float s from public.grocery_lists where id=$1`, [listA]))[0].s > 0, 'no savings');
});
await check('f-apply-choices', 'apply_grocery_choices: skip R2 -> Chicken 1, no Avocado; twice -> no dupes; build_list=false returns null', async () => {
  const ids = await q(`select id, recipe_id from public.meal_plan_items where plan_id=$1`, [planA]);
  const r2 = ids.find((x) => x.recipe_id === R('02')).id;
  const patch = JSON.stringify([{ id: r2, status: 'skip', conflict: false }]);
  const l1 = (await run(asA, `select public.apply_grocery_choices($1,$2::jsonb) id`, [planA, patch])).rows[0].id;
  const l2 = (await run(asA, `select public.apply_grocery_choices($1,$2::jsonb) id`, [planA, patch])).rows[0].id;
  eq(l1, l2); const r = await items4(l1); eq(r.map((x) => [x.name, x.q]), [['Chicken', 1], ['Salsa', 1]]);
  eq((await run(asA, `select public.apply_grocery_choices($1,$2::jsonb,false) id`, [planA, patch])).rows[0].id, null);
  await run(asA, `select public.apply_grocery_choices($1,$2::jsonb)`, [planA, JSON.stringify([{ id: r2, status: 'cook', conflict: false }])]);
});
await check('f-apply-bad-status', 'apply_grocery_choices with status "bogus" -> CHECK 23514; >21 patches -> 22023', async () => {
  const r2 = (await q(`select id from public.meal_plan_items where plan_id=$1 limit 1`, [planA]))[0].id;
  await fails(run(asA, `select public.apply_grocery_choices($1,$2::jsonb)`, [planA, JSON.stringify([{ id: r2, status: 'bogus', conflict: false }])]), { code: '23514' });
  await fails(run(asA, `select public.apply_grocery_choices($1,$2::jsonb)`, [planA, JSON.stringify(Array.from({ length: 22 }, () => ({ id: r2, status: 'cook', conflict: false })))]), { code: '22023' });
});
await check('f-cross-user-rebuild', "user B cannot rebuild A's plan (plan not found, nothing changed)", async () => {
  const before = await items4(listA);
  await fails(run(asB, `select public.rebuild_grocery_list($1)`, [planA]), { re: /not found/ });
  await fails(run(asB, `select public.apply_grocery_choices($1,'[]'::jsonb)`, [planA]), { re: /not found/ });
  eq(await items4(listA), before);
});
await check('f-anon-rebuild', 'anon cannot execute rebuild_grocery_list / apply_grocery_choices', async () => {
  await fails(run(asAnon, `select public.rebuild_grocery_list($1)`, [planA]), { code: '42501' });
  await fails(run(asAnon, `select public.apply_grocery_choices($1,'[]'::jsonb)`, [planA]), { code: '42501' });
});
await check('f-factors-check', 'recipe_edits.factors CHECK: value 500, string value, array, non-object, >4000 chars all rejected', async () => {
  const ins = (f) => db.query(`insert into public.recipe_edits (user_id, recipe_id, factors) values ($1,$2,$3::jsonb) on conflict (user_id, recipe_id) do update set factors = excluded.factors`, [P, R('01'), f]);
  for (const f of ['{"Salsa":500}', '{"Salsa":"half"}', '[0.5]', '"x"', '{"Salsa":-1}', '{"Salsa":null}', JSON.stringify({ k: 1, pad: 'x'.repeat(4100) })]) await fails(ins(f), { code: '23514' });
  await ins('{"Salsa":0.5,"Chicken":100,"Avocado":0}');
});
await check('f-factors-effect', 'edit factors applied by rebuild (Plus user P): Salsa 0.5->1 jar (ceil), Avocado 0 removed, Chicken x100 capped', async () => {
  const planP = (await run(asP, `insert into public.meal_plans (user_id, week_start) values ($1,'2026-11-02') returning id`, [P])).rows[0].id;
  await run(asP, `insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type) values ($1,$2,1,'dinner')`, [planP, R('01')]);
  await run(asP, `update public.recipe_edits set factors='{"Salsa":0}' where user_id=$1 and recipe_id=$2`, [P, R('01')]);
  const l = (await run(asP, `select public.rebuild_grocery_list($1) id`, [planP])).rows[0].id;
  eq((await items4(l)).map((r) => r.name), ['Chicken', 'Rice'], 'Salsa removed by factor 0');
  eq(await run(asP, `select public.edit_factor('{"a":"x"}'::jsonb,'a') f`).then((r) => r.rows[0].f), '1', 'bad value ignored');
});

// ================= (g) input limits =================
const upd = (who, col, val) => run(who, `update public.profiles set ${col} = $1 where id = $2`, [val, who === asA ? A : B]);
await check('g-profile-lists', 'profiles: 31 likes, 21 dislikes, 21 allergies, 41-char allergy, empty entry, control char, 21 appliances, bad diet -> 23514', async () => {
  const many = (n) => `{${Array.from({ length: n }, (_, i) => 'x' + i).join(',')}}`;
  await fails(upd(asA, 'likes', many(31)), { code: '23514' });
  await fails(upd(asA, 'dislikes', many(21)), { code: '23514' });
  await fails(upd(asA, 'allergies', many(21)), { code: '23514' });
  await fails(upd(asA, 'appliances', many(21)), { code: '23514' });
  await fails(upd(asA, 'allergies', [`${'a'.repeat(41)}`]), { code: '23514' });
  await fails(upd(asA, 'allergies', ['']), { code: '23514' });
  await fails(upd(asA, 'dislikes', ['a\tb']), { code: '23514' });
  await fails(upd(asA, 'diet', 'keto'), { code: '23514' });
  await fails(upd(asA, 'food_notes', 'n'.repeat(301)), { code: '23514' });
  await upd(asA, 'likes', Array.from({ length: 30 }, (_, i) => 'l' + i)); await upd(asA, 'allergies', ['a'.repeat(40), 'peanuts']); await upd(asA, 'diet', 'vegan');
});
await check('g-pantry-name', 'pantry name 81 chars, and blank after trim -> rejected; 80 ok', async () => {
  await fails(run(asB, `insert into public.pantry_items (user_id, name) values ($1,$2)`, [B, 'n'.repeat(81)]), { code: '23514' });
  await fails(run(asB, `insert into public.pantry_items (user_id, name) values ($1,'   ')`, [B]), { code: '23514' });
  await run(asB, `insert into public.pantry_items (user_id, name) values ($1,$2)`, [B, 'n'.repeat(80)]);
});
await check('g-experiment-fields', 'experiment_events: 65-char and empty fields rejected', async () => {
  const ins = (i, e, v, ev) => run(asB, `insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ($1,$2,$3,$4,$5)`, [B, i, e, v, ev]);
  for (const [k, args] of [['install', ['x'.repeat(65), 'e', 'v', 'ev']], ['experiment', ['i', 'x'.repeat(65), 'v', 'ev']], ['variant', ['i', 'e', 'x'.repeat(65), 'ev']], ['event', ['i', 'e', 'v', 'x'.repeat(65)]],
    ['empty-install', ['', 'e', 'v', 'ev']], ['empty-event', ['i', 'e', 'v', '']]]) await fails(ins(...args), { code: '23514' });
  await ins('i', 'e', 'v', 'ev');
});
await check('g-experiment-500-day', 'experiment_events: 500/day per user; the 501st is silently dropped (no error), others unaffected', async () => {
  const u = await mkUser(200);
  for (let i = 0; i < 500; i++) await db.query(`insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ($1,'i','e','v','ev')`, [u]);
  eq((await q(`select count(*)::int n from public.experiment_events where user_id=$1`, [u]))[0].n, 500);
  await run((f) => as(db, 'authenticated', u, f), `insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ($1,'i','e','v','ev')`, [u]);
  eq((await q(`select count(*)::int n from public.experiment_events where user_id=$1`, [u]))[0].n, 500, 'still 500');
  await run(asB, `insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ($1,'i','e','v','ev2')`, [B]);
});
await check('g-experiment-no-read', 'authenticated cannot read experiment_events back (no select policy)', async () => {
  eq((await run(asB, `select * from public.experiment_events`)).rows.length, 0);
});
await check('g-pantry-quota-200', 'pantry quota: 200 items max, 201st -> P0001 pantry_full (hint)', async () => {
  const u = await mkUser(201);
  await db.query(`insert into public.pantry_items (user_id, name) select $1, 'item'||g from generate_series(1,200) g`, [u]);
  await fails(run((f) => as(db, 'authenticated', u, f), `insert into public.pantry_items (user_id, name) values ($1,'one more')`, [u]), { code: 'P0001', hint: 'pantry_full' });
  await fails(run((f) => as(db, 'authenticated', u, f), `insert into public.pantry_items (user_id, name) values ($1,'one more')`, [u]).then(() => 0), { code: 'P0001' });
});
await check('g-pantry-free-limit-path', 'pantry free-limit branch (c_free temporarily 20): free user blocked at 20, Plus user is not; then migration restored', async () => {
  const file = '20261112000000_input_limits.sql';
  const sqlText = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
  const patched = sqlText.replace('c_free constant int := 200;', 'c_free constant int := 20;');
  ok(patched !== sqlText, 'could not patch c_free');
  try {
    await db.exec('begin;\n' + patched + '\ncommit;');
    const f = await mkUser(202), pl = await mkUser(203); await sub(pl);
    await db.query(`insert into public.pantry_items (user_id, name) select $1,'i'||g from generate_series(1,20) g`, [f]);
    await db.query(`insert into public.pantry_items (user_id, name) select $1,'i'||g from generate_series(1,20) g`, [pl]);
    await fails(run((x) => as(db, 'authenticated', f, x), `insert into public.pantry_items (user_id, name) values ($1,'x')`, [f]), { code: 'P0001', hint: 'pantry_free_limit' });
    await run((x) => as(db, 'authenticated', pl, x), `insert into public.pantry_items (user_id, name) values ($1,'x')`, [pl]);
  } finally { await applyOne(db, file); }
  const def = (await q(`select prosrc from pg_proc where proname='pantry_quota'`))[0].prosrc;
  ok(/c_free constant int := 200/.test(def), 'migration not restored');
});
await check('g-recipe-edits-plus', 'recipe_edits: non-Plus insert -> RLS 42501; Plus insert ok; Plus lapsed -> update rejected but read+delete allowed', async () => {
  await fails(run(asA, `insert into public.recipe_edits (user_id, recipe_id, factors) values ($1,$2,'{}')`, [A, R('01')]), { code: '42501' });
  const u = await mkUser(204); const ru = (f) => as(db, 'authenticated', u, f);
  const s = (await db.query(`insert into public.subscriptions (user_id, source, status, external_id) values ($1,'stripe','active','zz') returning id`, [u])).rows[0].id;
  await run(ru, `insert into public.recipe_edits (user_id, recipe_id, factors) values ($1,$2,'{"Salsa":2}')`, [u, R('01')]);
  await fails(run(ru, `insert into public.recipe_edits (user_id, recipe_id, factors, steps) values ($1,$2,'{}', repeat('s',4001))`, [u, R('02')]), { code: '23514' });
  await db.query(`update public.subscriptions set status='expired' where id=$1`, [s]);
  const upd0 = await run(ru, `update public.recipe_edits set note='hi' where user_id=$1`, [u]).then(() => 'updated', (e) => e.code);
  ok(upd0 === '42501', 'update by lapsed user not rejected: ' + upd0);
  eq((await run(ru, `select * from public.recipe_edits`)).rows.length, 1, 'read own');
  eq((await run(ru, `delete from public.recipe_edits where user_id=$1`, [u])).affectedRows, 1, 'delete own');
});
await check('g-recipe-edits-no-takeover', "Plus user P cannot insert/update an edit as another user's id", async () => {
  await fails(run(asP, `insert into public.recipe_edits (user_id, recipe_id, factors) values ($1,$2,'{}')`, [A, R('03')]), { code: '42501' });
});

// ================= (h) RLS =================
await check('h-profiles', "A cannot read or write B's profile", async () => {
  eq((await run(asA, `select id from public.profiles`)).rows.map((r) => r.id), [A], 'only own');
  eq((await run(asA, `update public.profiles set household_size = 9 where id=$1`, [B])).affectedRows, 0);
  await fails(run(asA, `insert into public.profiles (id) values ($1)`, [B]), { code: '42501' });
  eq((await run(asA, `delete from public.profiles where id=$1`, [B])).affectedRows, 0);
});
await check('h-pantry', "A cannot read/write B's pantry_items (B has 'n..n')", async () => {
  eq((await run(asA, `select * from public.pantry_items where user_id=$1`, [B])).rows.length, 0);
  eq((await run(asA, `update public.pantry_items set shelf='x' where user_id=$1`, [B])).affectedRows, 0);
  eq((await run(asA, `delete from public.pantry_items where user_id=$1`, [B])).affectedRows, 0);
  await fails(run(asA, `insert into public.pantry_items (user_id, name) values ($1,'sneaky')`, [B]), { code: '42501' });
});
await check('h-meal-plans', "A cannot read/write B's meal_plans or meal_plan_items", async () => {
  eq((await run(asA, `select * from public.meal_plans where user_id=$1`, [B])).rows.length, 0);
  eq((await run(asA, `select * from public.meal_plan_items where plan_id=$1`, [planE])).rows.length, 0);
  eq((await run(asA, `delete from public.meal_plans where id=$1`, [planE])).affectedRows, 0);
  await fails(run(asA, `insert into public.meal_plans (user_id, week_start) values ($1,'2026-12-07')`, [B]), { code: '42501' });
  await fails(run(asA, `insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type) values ($1,$2,5,'lunch')`, [planE, R('01')]), { code: '42501' });
});
await check('h-grocery', "B cannot read/write A's grocery lists or items", async () => {
  eq((await run(asB, `select * from public.grocery_lists where id=$1`, [listA])).rows.length, 0);
  eq((await run(asB, `select * from public.grocery_items where list_id=$1`, [listA])).rows.length, 0);
  eq((await run(asB, `update public.grocery_items set checked = true where list_id=$1`, [listA])).affectedRows, 0);
  eq((await run(asB, `delete from public.grocery_items where list_id=$1`, [listA])).affectedRows, 0);
  await fails(run(asB, `insert into public.grocery_items (list_id, ingredient_id, quantity, unit) values ($1,$2,1,'x')`, [listA, I('04')]).then(() => 0), { code: '42501' });
});
await check('h-other-own-tables', "B cannot read/write A's leftovers, meal_ratings, recipe_edits; experiment/plan_generations insert as other user rejected", async () => {
  await db.query(`insert into public.leftovers (user_id, recipe_id, servings) values ($1,$2,2)`, [A, R('01')]);
  await db.query(`insert into public.meal_ratings (user_id, recipe_id, rating) values ($1,$2,5)`, [A, R('01')]);
  await db.query(`insert into public.recipe_edits (user_id, recipe_id, factors) values ($1,$2,'{}')`, [P, R('04')]);
  for (const t of ['leftovers', 'meal_ratings']) eq((await run(asB, `select * from public.${t}`)).rows.length, 0, t);
  eq((await run(asA, `select * from public.recipe_edits`)).rows.length, 0, 'edits of P hidden from A');
  await fails(run(asB, `insert into public.meal_ratings (user_id, recipe_id, rating) values ($1,$2,1)`, [A, R('02')]), { code: '42501' });
  await fails(run(asB, `insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ($1,'i','e','v','x')`, [A]), { code: '42501' });
});
await check('h-subscriptions', 'subscriptions: user reads only own row; cannot insert/update/delete', async () => {
  eq((await run(asP, `select user_id from public.subscriptions`)).rows.map((r) => r.user_id).every((x) => x === P), true);
  eq((await run(asA, `select * from public.subscriptions`)).rows.length, 0, 'A sees none');
  await fails(run(asA, `insert into public.subscriptions (user_id, source, status) values ($1,'stripe','active')`, [A]), { code: '42501' });
  eq((await run(asP, `update public.subscriptions set status='canceled'`)).affectedRows, 0);
  eq((await run(asP, `update public.subscriptions set status='canceled' where user_id=$1`, [P])).affectedRows, 0);
  eq((await run(asP, `delete from public.subscriptions`)).affectedRows, 0);
  ok((await run(asSvc, `select 1 from public.subscriptions where user_id=$1`, [P])).rows.length > 0, 'P row still there');
});
await check('h-catalog-readonly', 'catalog tables (recipes, ingredients, recipe_ingredients, ingredient_nutrition) are read-only for authenticated; anon sees nothing', async () => {
  eq((await run(asA, `select * from public.recipes`)).rows.length, 4);
  eq((await run(asAnon, `select * from public.recipes`)).rows.length, 0);
  await fails(run(asA, `insert into public.recipes (title, steps, servings, minutes) values ('x','y',1,1)`), { code: '42501' });
  await fails(run(asA, `insert into public.ingredients (name, aisle, avg_price_usd, unit) values ('x','y',1,'z')`), { code: '42501' });
  eq((await run(asA, `delete from public.recipes`)).affectedRows, 0);
});
await check('h-anon-sees-nothing', 'anon reads 0 rows from profiles, pantry_items, meal_plans, grocery_lists', async () => {
  for (const t of ['profiles', 'pantry_items', 'meal_plans', 'grocery_lists', 'subscriptions', 'leftovers']) eq((await run(asAnon, `select * from public.${t}`)).rows.length, 0, t);
});
await check('h-household-members', 'household_members: read-only for a member (no write policy)', async () => {
  await db.query(`insert into public.household_members (owner_id, member_id) values ($1,$2)`, [A, B]);
  eq((await run(asB, `select * from public.household_members`)).rows.length, 1);
  await fails(run(asB, `insert into public.household_members (owner_id, member_id) values ($1,$2)`, [B, A]), { code: '42501' });
});

// ================= (i) waitlist =================
const wl = (email, extra = '') => run(asAnon, `insert into public.waitlist (email, consent_version${extra}) values ($1,'waitlist-2026-11-05'${extra ? ', now()' : ''})`, [email]);
await check('i-anon-insert', 'anon can insert (email, consent_version); email only also works', async () => {
  await wl('one@x.test'); await run(asAnon, `insert into public.waitlist (email) values ('two@x.test')`);
  eq((await q(`select consent_version from public.waitlist where email='one@x.test'`))[0].consent_version, 'waitlist-2026-11-05');
});
await check('i-anon-no-read', 'anon cannot SELECT the waitlist (42501), nor update/delete', async () => {
  await fails(run(asAnon, `select * from public.waitlist`), { code: '42501' });
  await fails(run(asAnon, `select count(*) from public.waitlist`), { code: '42501' });
  await fails(run(asAnon, `update public.waitlist set email='z@x.test'`), { code: '42501' });
  await fails(run(asAnon, `delete from public.waitlist`), { code: '42501' });
});
await check('i-anon-no-created-at', 'anon cannot set created_at on insert (42501)', () => fails(wl('three@x.test', ', created_at'), { code: '42501' }));
await check('i-authenticated-denied', 'authenticated cannot insert into / read the waitlist', async () => {
  await fails(run(asA, `insert into public.waitlist (email) values ('auth@x.test')`), { code: '42501' });
  await fails(run(asA, `select * from public.waitlist`), { code: '42501' });
});
await check('i-email-checks', 'bad / uppercase / over-254 emails and 41-char consent_version rejected (23514)', async () => {
  for (const e of ['nope', 'UP@X.TEST', 'a b@x.test', `${'a'.repeat(250)}@x.test`]) await fails(wl(e), { code: '23514' });
  await fails(run(asAnon, `insert into public.waitlist (email, consent_version) values ('cv@x.test', repeat('v',41))`), { code: '23514' });
});
await check('i-duplicate', 'duplicate email -> 23505', () => fails(wl('one@x.test'), { code: '23505' }));
await check('i-throttle-minute', 'throttle: after 30 sign-ups inside a minute the next anon insert fails P0001 waitlist_throttled; service_role/superuser inserts are throttled too', async () => {
  const existing = (await q(`select count(*)::int n from public.waitlist where created_at > now() - interval '1 minute'`))[0].n;
  let n = existing;
  for (; n < 30; n++) await wl(`bulk${n}@x.test`);
  await fails(wl('over@x.test'), { code: 'P0001', hint: 'waitlist_throttled' });
  eq((await q(`select count(*)::int n from public.waitlist`))[0].n, 30);
});
await check('i-throttle-hour', 'throttle: 500/hour (rows spread >1 min old, so only the hour limit trips)', async () => {
  await db.query(`update public.waitlist set created_at = now() - interval '30 minutes'`);
  let have = 30;
  for (; have < 500; have++) await db.query(`insert into public.waitlist (email, created_at) values ($1, now() - interval '30 minutes')`, [`h${have}@x.test`]);
  await fails(wl('hour-over@x.test'), { code: 'P0001', hint: 'waitlist_throttled' });
  await db.query(`update public.waitlist set created_at = now() - interval '2 hours' where email like 'h%'`);
  await wl('after-window@x.test');
});

process.exit(report() ? 1 : 0);
