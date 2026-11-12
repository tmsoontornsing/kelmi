// Cross-user access checks on a local PGlite copy of the schema. LOCAL ONLY.
// Each check asserts the SECURE outcome: a FAIL means the hole is real.
// Run from supabase/scripts/pg-local-test:  node ../redteam/rls-tampering.mjs
import { makeDb, applyAll, as } from '../pg-local-test/harness.mjs';
import { check, eq, ok, fails, report } from '../pg-local-test/t.mjs';

const db = await makeDb();
const mig = await applyAll(db);
ok(mig.every((r) => r.ok), 'migrations: ' + JSON.stringify(mig.filter((r) => !r.ok)));

const A = '00000000-0000-4000-8000-00000000aaa1', B = '00000000-0000-4000-8000-00000000bbb2';
const R1 = '20000000-0000-4000-8000-000000000001', I1 = '10000000-0000-4000-8000-000000000001';
const asA = (s, p) => as(db, 'authenticated', A, (d) => d.query(s, p));
const asB = (s, p) => as(db, 'authenticated', B, (d) => d.query(s, p));
const asAnon = (s, p) => as(db, 'anon', null, (d) => d.query(s, p));
const asSvc = (s, p) => as(db, 'service_role', null, (d) => d.query(s, p));
const one = async (s, p) => (await db.query(s, p)).rows[0];

// ---- fixtures: A has a plan, a grocery list, a leftover, pantry, rating, event ----
for (const [id, e] of [[A, 'a'], [B, 'b']]) await db.query(`insert into auth.users (id, email) values ($1,$2)`, [id, `${e}@x.test`]);
await db.exec(`
  insert into public.ingredients (id, name, aisle, avg_price_usd, unit) values ('${I1}','Peanut','dry',2,'lb');
  insert into public.recipes (id, title, steps, servings, minutes) values ('${R1}','Satay','s',2,10);
  insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit) values ('${R1}','${I1}',1,'lb');`);
await asSvc(`select public.replace_meal_plan($1,'2026-11-02','[{"recipe_id":"${R1}","day_of_week":1,"meal_type":"dinner"}]'::jsonb)`, [A]);
const planA = (await one(`select id from public.meal_plans where user_id=$1`, [A])).id;
await db.query(`insert into public.leftovers (user_id, recipe_id, servings) values ($1,$2,2)`, [A, R1]);
const leftA = (await one(`select id from public.leftovers where user_id=$1`, [A])).id;
await db.query(`insert into public.pantry_items (user_id, ingredient_id, name) values ($1,$2,'Peanut')`, [A, I1]);
await db.query(`insert into public.meal_ratings (user_id, recipe_id, rating) values ($1,$2,5)`, [A, R1]);
// B has its own plan for the leftover test
await asSvc(`select public.replace_meal_plan($1,'2026-11-02','[{"recipe_id":"${R1}","day_of_week":1,"meal_type":"dinner"}]'::jsonb)`, [B]);
const planB = (await one(`select id from public.meal_plans where user_id=$1`, [B])).id;

// ---- 1. B cannot read, change or delete A's rows ----
const OWNED = [['profiles', 'id'], ['meal_plans', 'user_id'], ['pantry_items', 'user_id'], ['leftovers', 'user_id'], ['meal_ratings', 'user_id'], ['plan_generations', 'user_id'], ['subscriptions', 'user_id']];
for (const [t, col] of OWNED) {
  await check(`read-${t}`, `B sees none of A's ${t}`, async () => eq((await asB(`select 1 from public.${t} where ${col}=$1`, [A])).rows.length, 0));
  await check(`del-${t}`, `B deletes none of A's ${t}`, async () => {
    const before = (await db.query(`select count(*)::int n from public.${t} where ${col}=$1`, [A])).rows[0].n;
    try { await asB(`delete from public.${t} where ${col}=$1`, [A]); } catch {}
    eq((await db.query(`select count(*)::int n from public.${t} where ${col}=$1`, [A])).rows[0].n, before);
  });
}
await check('read-items', `B sees none of A's meal_plan_items`, async () => eq((await asB(`select 1 from public.meal_plan_items where plan_id=$1`, [planA])).rows.length, 0));
await check('anon-profiles', 'anon sees no profiles', async () => eq((await asAnon(`select 1 from public.profiles`)).rows.length, 0));
await check('anon-waitlist', 'anon cannot read the waitlist', async () => {
  await db.query(`insert into public.waitlist (email, consent_version) values ('v@x.test','v1')`).catch(() => {});
  let rows = [];
  try { rows = (await asAnon(`select * from public.waitlist`)).rows; } catch { return 'denied'; }
  eq(rows.length, 0);
});
await check('ins-as-A', 'B cannot insert a row owned by A', () => fails(asB(`insert into public.pantry_items (user_id, ingredient_id, name) values ($1,$2,'Peanut')`, [A, I1]), { code: '42501' }));

// ---- 2. Squatting / dangling references to another user's rows ----
await check('squat-grocery', `B cannot create a grocery list on A's plan_id`, () =>
  fails(asB(`insert into public.grocery_lists (plan_id, user_id) values ($1,$2)`, [planA, B])));
await check('foreign-leftover', `B cannot point its meal at A's leftover`, () =>
  fails(asB(`update public.meal_plan_items set status='leftover', leftover_id=$1 where plan_id=$2`, [leftA, planB]).then((r) => { if (!r.affectedRows) throw new Error('no-op'); return r; })));

// ---- 3. Values a user should not be able to forge ----
await check('neg-total', 'grocery totals cannot be negative', async () => {
  await db.query(`insert into public.grocery_lists (plan_id, user_id) values ($1,$2) on conflict (plan_id) do nothing`, [planB, B]);
  return fails(asB(`update public.grocery_lists set estimated_total_usd = -999 where plan_id=$1`, [planB]).then((r) => { if (!r.affectedRows) throw new Error('no list to update'); return r; }));
});
await check('erase-consent', 'a user cannot delete their own profile row (erases consent record)', async () => {
  await db.query(`update public.profiles set age_confirmed_at = now() where id=$1`, [A]);
  try { await asA(`delete from public.profiles where id=$1`, [A]); } catch {}
  ok(await one(`select 1 from public.profiles where id=$1`, [A]), 'profile row was deleted');
});
await check('set-conflict', 'a user cannot clear the allergen conflict flag directly', async () => {
  await db.query(`update public.meal_plan_items set conflict = true where plan_id=$1`, [planA]);
  try { await asA(`update public.meal_plan_items set conflict = false where plan_id=$1`, [planA]); } catch {}
  eq((await one(`select bool_and(conflict) c from public.meal_plan_items where plan_id=$1`, [planA])).c, true);
});
await check('old-rpc-conflict', 'the transitional apply_grocery_choices(plan, patches) cannot clear the allergen flag', async () => {
  await db.query(`update public.meal_plan_items set conflict = true where plan_id=$1`, [planA]);
  const item = (await one(`select id from public.meal_plan_items where plan_id=$1 limit 1`, [planA])).id;
  try { await asA(`select public.apply_grocery_choices($1,$2::jsonb,false)`, [planA, JSON.stringify([{ id: item, status: 'cook', conflict: false }])]); } catch {}
  eq((await one(`select conflict from public.meal_plan_items where id=$1`, [item])).conflict, true);
});
for (const [t, sql] of [
  ['subscriptions', `insert into public.subscriptions (user_id, source, status, external_id) values ('${A}','revenuecat','active','x')`],
  ['subscriptions-upd', `update public.subscriptions set status='active'`],
  ['recipes', `insert into public.recipes (title, steps, servings, minutes) values ('x','s',1,1)`],
  ['ingredients', `update public.ingredients set avg_price_usd = 0`],
  ['experiment-other', `insert into public.experiment_events (user_id, install_id, experiment, variant, event) values ('${B}','i','e','v','x')`],
]) {
  await check(`write-${t}`, `A cannot write ${t}`, async () => {
    let r; try { r = await asA(sql); } catch { return 'denied'; }
    eq(r.affectedRows ?? 0, 0, 'rows changed');
  });
}

process.exit(report() ? 1 : 0);
