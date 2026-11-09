// Old-data hazards: seed bad rows BEFORE migrations 20261110..15, then confirm they behave as designed.
import { makeDb, applyAll } from './harness.mjs';
import { check, eq, ok, report } from './t.mjs';

const db = await makeDb();
const first = await applyAll(db, { to: '20261109000000' });
ok(first.every((r) => r.ok), 'old migrations must apply: ' + JSON.stringify(first.filter((r) => !r.ok)));
const q = async (s, p) => (await db.query(s, p)).rows;
const U = (n) => `00000000-0000-4000-8000-00000000000${n}`;
for (let n = 1; n <= 4; n++) await db.query(`insert into auth.users (id, email) values ($1, $2)`, [U(n), `u${n}@x.test`]);

// recipes / ingredients for the grocery + edits hazards
await db.exec(`
 insert into public.ingredients (id, name, aisle, avg_price_usd, unit) values ('10000000-0000-4000-8000-000000000001','Salsa','x',3,'jar');
 insert into public.recipes (id, title, steps, servings, minutes) values ('20000000-0000-4000-8000-000000000001','R1','s',2,10);
 insert into public.recipes (id, title, steps, servings, minutes) values ('20000000-0000-4000-8000-000000000002','R2','s',2,10);
 insert into public.recipes (id, title, steps, servings, minutes) values ('20000000-0000-4000-8000-000000000003','R3','s',2,10);
 insert into public.recipes (id, title, steps, servings, minutes) values ('20000000-0000-4000-8000-000000000004','R4','s',2,10);`);

// H1: unknown diet + overlong dislike + overlong allergy on user 1 (allergy must block migration 1112)
await db.query(`update public.profiles set diet='keto', dislikes=array[repeat('d',60), 'ok', E'tab\\there', ''], allergies=array[repeat('a',41)] where id=$1`, [U(1)]);
// H2: pantry name collision after 80-char cut (user 2): one exact-80, two longer that cut to the same name, one unrelated
const base = 'p'.repeat(80);
await db.query(`insert into public.pantry_items (user_id, name) values ($1,$2),($1,$3),($1,$4),($1,'milk')`, [U(2), base + 'X', base, base + 'Y']);
// H3: experiment_events with empty string + one over-long + one good
await db.query(`insert into public.experiment_events (user_id, install_id, experiment, variant, event) values
  ($1,'i','','v','e'), ($1,'i',repeat('e',70),'v','e'), ($1,'i','exp','v','e')`, [U(3)]);
// H4: recipe_edits with non-object / out-of-range / mixed factors
await db.query(`insert into public.recipe_edits (user_id, recipe_id, factors, steps) values
  ($1,'20000000-0000-4000-8000-000000000001','[1,2]'::jsonb,null),
  ($1,'20000000-0000-4000-8000-000000000002','"str"'::jsonb,repeat('s',4100)),
  ($1,'20000000-0000-4000-8000-000000000003','{"Salsa":500,"Bad":"x","Neg":-3,"Half":0.5}'::jsonb,null),
  ($1,'20000000-0000-4000-8000-000000000004','{"Salsa":0.5}'::jsonb,null)`, [U(3)]);
// H5: duplicate grocery_items on one list
await db.exec(`
 insert into public.meal_plans (id, user_id, week_start) values ('30000000-0000-4000-8000-000000000001','${U(4)}','2026-11-02');
 insert into public.grocery_lists (id, plan_id, user_id) values ('40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','${U(4)}');
 insert into public.grocery_items (list_id, ingredient_id, quantity, unit, checked) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'jar',false),
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',2,'jar',true),
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',3,'jar',false);`);

const r1 = await applyAll(db, { from: '20261110000000', to: '20261111000000' });
await check('H0', '20261110 and 20261111 apply on top of dirty data', () => ok(r1.every((r) => r.ok), JSON.stringify(r1)));

await check('H1', 'recipe_edits: non-object -> {}, out-of-range clamped, non-number dropped, long steps untouched until 1112', async () => {
  const rows = await q(`select recipe_id, factors from public.recipe_edits order by recipe_id`);
  eq(rows[0].factors, {}, 'array'); eq(rows[1].factors, {}, 'string');
  eq(Object.entries(rows[2].factors).sort(), [['Half', 0.5], ['Neg', 0], ['Salsa', 100]], 'mixed'); eq(rows[3].factors, { Salsa: 0.5 }, 'valid unchanged');
});
await check('H2', 'grocery_items: duplicates collapsed to one (the checked one kept), unique index present', async () => {
  const rows = await q(`select quantity, checked from public.grocery_items`);
  eq(rows.length, 1, 'rows'); eq(rows[0].checked, true, 'checked kept');
  eq((await q(`select 1 from pg_indexes where indexname='grocery_items_list_ingredient'`)).length, 1, 'index');
});

const r2 = await applyAll(db, { from: '20261112000000', to: '20261112000000' });
await check('H3', '20261112 raises a clear exception for a 41-char allergy and applies nothing', async () => {
  ok(!r2[0].ok, 'migration should have failed');
  ok(/input_limits: 0 profile\(s\) have more than 20 allergies and 1 profile\(s\) have an allergy entry longer than 40/.test(r2[0].error), r2[0].error);
  eq((await q(`select diet from public.profiles where id=$1`, [U(1)]))[0].diet, 'keto', 'diet unchanged (rolled back)');
  eq((await q(`select 1 from pg_constraint where conname='profiles_lists_ok'`)).length, 0, 'no constraint added');
  eq((await q(`select 1 from pg_proc where proname='pantry_quota'`)).length, 0, 'no function added');
  eq((await q(`select count(*)::int n from public.pantry_items where user_id=$1`, [U(2)]))[0].n, 4, 'pantry untouched');
  return r2[0].error.slice(0, 120);
});
// Owner fixes the allergy row by hand, re-runs.
await db.query(`update public.profiles set allergies=array['tree nuts'] where id=$1`, [U(1)]);
const r3 = await applyAll(db, { from: '20261112000000' });
await check('H4', 'after the hand fix, 20261112..15 apply', () => ok(r3.every((r) => r.ok), JSON.stringify(r3.filter((r) => !r.ok))));

await check('H5', 'profile: unknown diet -> any; dislikes trimmed/cleaned (cut to 40, control->space, empty dropped)', async () => {
  const p = (await q(`select diet, dislikes from public.profiles where id=$1`, [U(1)]))[0];
  eq(p.diet, 'any'); eq(p.dislikes, ['d'.repeat(40), 'ok', 'tab here'], 'dislikes');
});
await check('H6', 'pantry: 3 colliding names collapse to 1 (the uncut 80-char one wins), cut to <=80, unrelated kept', async () => {
  const rows = await q(`select name, char_length(name) n from public.pantry_items where user_id=$1 order by name`, [U(2)]);
  eq(rows.length, 2, 'rows'); eq(rows.map((r) => r.name), ['milk', base]); 
});
await check('H7', 'experiment_events: empty-field row deleted, long value cut to 64, good row kept', async () => {
  const rows = await q(`select experiment from public.experiment_events order by experiment`);
  eq(rows.length, 2); eq(rows.map((r) => r.experiment.length).sort(), [3, 64]);
});
await check('H8', 'recipe_edits.steps over 4000 cut to 4000; constraints now in place', async () => {
  const r = await q(`select char_length(steps) n from public.recipe_edits where steps is not null`);
  eq(r[0].n, 4000);
});
process.exit(report() ? 1 : 0);
