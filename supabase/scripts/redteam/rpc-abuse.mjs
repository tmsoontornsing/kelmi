// Red-team: abuse database functions (RPCs) and tables as anon / authenticated. LOCAL PGlite ONLY, no network.
// Run: cd supabase/scripts/pg-local-test && node ../redteam/rpc-abuse.mjs
import { makeDb, applyAll, as } from '../pg-local-test/harness.mjs';

const db = await makeDb();
const mig = await applyAll(db);
if (!mig.every((r) => r.ok)) { console.error('migrations failed', mig.filter((r) => !r.ok)); process.exit(2); }

const q = async (s, p) => (await db.query(s, p)).rows;
const A = '00000000-0000-4000-8000-0000000000a1', B = '00000000-0000-4000-8000-0000000000b2';
const PEANUT = '10000000-0000-4000-8000-000000000001', RICE = '10000000-0000-4000-8000-000000000002';
const SATAY = '20000000-0000-4000-8000-000000000001', PLAIN = '20000000-0000-4000-8000-000000000002';
const asA = (fn) => as(db, 'authenticated', A, fn);
const asB = (fn) => as(db, 'authenticated', B, fn);
const asAnon = (fn) => as(db, 'anon', null, fn);
const asSvc = (fn) => as(db, 'service_role', null, fn);
const run = (who, s, p) => who((d) => d.query(s, p));

for (const [id, em] of [[A, 'a'], [B, 'b']]) await db.query(`insert into auth.users (id, email) values ($1,$2)`, [id, `${em}@x.test`]);
await db.exec(`
  insert into public.ingredients (id, name, aisle, avg_price_usd, unit) values
    ('${PEANUT}','Peanuts','nuts',3,'bag'), ('${RICE}','Rice','dry',2,'lb');
  insert into public.recipes (id, title, steps, servings, minutes) values
    ('${SATAY}','Peanut satay','s',2,10), ('${PLAIN}','Plain rice','s',2,10);
  insert into public.recipe_ingredients (recipe_id, ingredient_id, quantity, unit) values
    ('${SATAY}','${PEANUT}',1,'bag'), ('${SATAY}','${RICE}',1,'lb'), ('${PLAIN}','${RICE}',1,'lb');`);

const results = [];
const ACCEPTED = new Set(['1c']);   // self-only, by design: a person may write their own grocery lines
async function attack(id, name, fn) {
  let r;
  try { r = await fn(); } catch (e) { r = { proven: false, evidence: `error ${e.code ?? ''} ${e.message}` }; }
  if (ACCEPTED.has(id) && r.proven) { r = { ...r, proven: false, evidence: 'ACCEPTED RISK: ' + r.evidence }; }
  results.push({ id, name, ...r });
  console.log(`${r.proven ? 'PROVEN ' : 'BLOCKED'}  ${id}  ${name}\n         ${String(r.evidence).slice(0, 400)}`);
}
const tryErr = async (p) => { try { const v = await p; return { ok: true, v }; } catch (e) { return { ok: false, code: e.code, msg: e.message }; } };

// ---------- fixtures as the real app would create them ----------
await run(asA, `update public.profiles set allergies = '{peanuts}', household_size = 2 where id = $1`, [A]);
// Plans are made by the service (replace_meal_plan); fixtures are written directly.
const planA = (await q(`insert into public.meal_plans (user_id, week_start) values ($1,'2026-11-09') returning id`, [A]))[0].id;
await q(`insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type, conflict) values ($1,$2,1,'dinner',false),($1,$3,2,'dinner',false)`, [planA, SATAY, PLAIN]);
const satayItem = (await q(`select id from public.meal_plan_items where plan_id=$1 and recipe_id=$2`, [planA, SATAY]))[0].id;
const plainItem = (await q(`select id from public.meal_plan_items where plan_id=$1 and recipe_id=$2`, [planA, PLAIN]))[0].id;
const planB = (await q(`insert into public.meal_plans (user_id, week_start) values ($1,'2026-11-09') returning id`, [B]))[0].id;
await q(`insert into public.meal_plan_items (plan_id, recipe_id, day_of_week, meal_type, conflict) values ($1,$2,1,'dinner',false)`, [planB, PLAIN]);
const listNames = async (list) => (await q(`select i.name, gi.quantity::float q from public.grocery_items gi join public.ingredients i on i.id=gi.ingredient_id where gi.list_id=$1 order by 1`, [list]));

// ================= 1. Allergen bypass =================
await attack('1a', 'apply_grocery_choices with conflict:false puts an allergen meal (peanuts) on the list of a peanut-allergic user', async () => {
  // What the grocery-list Edge Function would send: satay flagged conflict.
  const good = JSON.stringify([{ id: satayItem, status: 'cook', conflict: true }, { id: plainItem, status: 'cook', conflict: false }]);
  const l0 = (await run(asSvc, `select public.apply_grocery_choices($1,$2,$3::jsonb) id`, [A, planA, good])).rows[0].id;   // the Edge Function's call
  const before = (await listNames(l0)).map((r) => r.name);
  // Attacker calls the RPC directly, clearing the flag.
  const evil = JSON.stringify([{ id: satayItem, status: 'cook', conflict: false }]);
  const l1 = (await run(asA, `select public.apply_grocery_choices($1,$2,$3::jsonb) id`, [A, planA, evil])).rows[0].id;
  await run(asA, `select public.rebuild_grocery_list($1)`, [planA]);
  const after = (await listNames(l1)).map((r) => r.name);
  const allergies = (await q(`select allergies from public.profiles where id=$1`, [A]))[0].allergies;
  return { proven: !before.includes('Peanuts') && after.includes('Peanuts'), evidence: `allergies=${JSON.stringify(allergies)} list before=${JSON.stringify(before)} after=${JSON.stringify(after)}` };
});
await attack('1b', 'same bypass with a plain PATCH: UPDATE meal_plan_items SET conflict=false (RLS allows it), then rebuild_grocery_list', async () => {
  await run(asA, `update public.meal_plan_items set conflict = true where id=$1`, [satayItem]);
  const l = (await run(asA, `select public.rebuild_grocery_list($1) id`, [planA])).rows[0].id;
  const b = (await listNames(l)).map((r) => r.name);
  const n = (await run(asA, `update public.meal_plan_items set conflict = false where id=$1`, [satayItem])).affectedRows;
  await run(asA, `select public.rebuild_grocery_list($1)`, [planA]);
  const a = (await listNames(l)).map((r) => r.name);
  return { proven: n === 1 && !b.includes('Peanuts') && a.includes('Peanuts'), evidence: `rows updated=${n}; before=${JSON.stringify(b)} after=${JSON.stringify(a)}` };
});
await attack('1c', 'insert an allergen line straight into own grocery_items (no RPC at all)', async () => {
  const l = (await q(`select id from public.grocery_lists where plan_id=$1`, [planA]))[0].id;
  await run(asA, `delete from public.grocery_items where list_id=$1 and ingredient_id=$2`, [l, PEANUT]);
  const r = await tryErr(run(asA, `insert into public.grocery_items (list_id, ingredient_id, quantity, unit) values ($1,$2,5,'bag')`, [l, PEANUT]));
  return { proven: r.ok, evidence: r.ok ? 'inserted Peanuts into list' : `${r.code} ${r.msg}` };
});

// ================= 2. Cross-user plan ids =================
await attack('2a', "A calls rebuild_grocery_list / apply_grocery_choices with B's plan_id", async () => {
  const r1 = await tryErr(run(asA, `select public.rebuild_grocery_list($1)`, [planB]));
  const r2 = await tryErr(run(asA, `select public.apply_grocery_choices($1,'[]'::jsonb)`, [planB]));
  return { proven: r1.ok || r2.ok, evidence: `rebuild: ${r1.ok ? 'OK' : r1.msg}; apply: ${r2.ok ? 'OK' : r2.msg}` };
});
await attack('2b', "A patches B's meal_plan_items ids through A's own plan_id in apply_grocery_choices", async () => {
  const bItem = (await q(`select id from public.meal_plan_items where plan_id=$1`, [planB]))[0].id;
  await run(asA, `select public.apply_grocery_choices($1,$2::jsonb,false)`, [planA, JSON.stringify([{ id: bItem, status: 'skip', conflict: true }])]);
  const s = (await q(`select status, conflict from public.meal_plan_items where id=$1`, [bItem]))[0];
  return { proven: s.status === 'skip', evidence: `B's item after: ${JSON.stringify(s)}` };
});
await attack('2c', "A squats B's plan by inserting a grocery_lists row with B's plan_id (FK check ignores RLS) -> B's rebuild breaks (DoS, needs B's plan uuid)", async () => {
  const ins = await tryErr(run(asA, `insert into public.grocery_lists (plan_id, user_id) values ($1,$2)`, [planB, A]));
  if (!ins.ok) return { proven: false, evidence: `${ins.code} ${ins.msg}` };
  const rb = await tryErr(run(asB, `select public.rebuild_grocery_list($1)`, [planB]));
  const ap = await tryErr(run(asB, `select public.apply_grocery_choices($1,'[]'::jsonb)`, [planB]));
  const own = (await q(`select user_id from public.grocery_lists where plan_id=$1`, [planB]))[0];
  return { proven: !rb.ok, evidence: `squat row owner=${own.user_id === A ? 'A' : '?'}; B rebuild -> ${rb.ok ? 'OK' : rb.code + ' ' + rb.msg}; B apply -> ${ap.ok ? 'OK' : ap.code + ' ' + ap.msg}` };
});
await attack('2d', 'FK existence oracle: A can test whether an arbitrary plan uuid exists (23503 vs success)', async () => {
  await db.query(`delete from public.grocery_lists where user_id=$1 and plan_id=$2`, [A, planB]);
  const fake = await tryErr(run(asA, `insert into public.grocery_lists (plan_id, user_id) values (gen_random_uuid(),$1)`, [A]));
  const real = await tryErr(run(asA, `insert into public.grocery_lists (plan_id, user_id) values ($1,$2)`, [planB, A]));
  await db.query(`delete from public.grocery_lists where user_id=$1 and plan_id=$2`, [A, planB]);
  return { proven: !fake.ok && real.ok, evidence: `random uuid -> ${fake.code}; B's real plan -> ${real.ok ? 'accepted' : real.code}` };
});
await attack('2e', "A attaches B's leftover to A's meal via leftover_id (FK ignores RLS)", async () => {
  const lo = (await db.query(`insert into public.leftovers (user_id, recipe_id, servings) values ($1,$2,4) returning id`, [B, PLAIN])).rows[0].id;
  const r = await tryErr(run(asA, `update public.meal_plan_items set status='leftover', leftover_id=$1 where id=$2`, [lo, plainItem]));
  const seen = (await run(asA, `select * from public.cook_slots($1, 2)`, [planA])).rows;
  await run(asA, `update public.meal_plan_items set status='cook', leftover_id=null where id=$1`, [plainItem]);
  // The link is stored, but nothing of B's is read or changed: integrity smell only, so not counted as proven.
  return { proven: false, evidence: r.ok ? `link accepted but harmless; cook_slots under A's RLS: ${JSON.stringify(seen)} (B's servings not readable, so no data leak)` : r.msg };
});

// ================= 3. service-role-only functions =================
await attack('3', 'claim_plan_generation / record_generation_result / replace_meal_plan as authenticated and anon', async () => {
  const out = [];
  for (const [who, f] of [['auth', asA], ['anon', asAnon]]) {
    for (const s of [`select * from public.claim_plan_generation('${A}', false)`, `select public.record_generation_result(gen_random_uuid(),'failed','x','y',0,0)`,
      `select public.replace_meal_plan('${A}','2026-11-02','[{"recipe_id":"${PLAIN}","day_of_week":1,"meal_type":"dinner"}]'::jsonb)`]) {
      const r = await tryErr(run(f, s)); out.push(`${who}:${s.match(/public\.(\w+)/)[1]}=${r.ok ? 'OK' : r.code}`);
    }
  }
  return { proven: out.some((x) => x.endsWith('OK')), evidence: out.join(' ') };
});

// ================= 4. consent =================
await attack('4a', 'record_consent("terms") accepts any 1-40 char version: whitespace, control chars, a future version', async () => {
  const acc = [];
  for (const v of [' ', '\n', '‮evil', '9999-12-31', "'; drop table x;--"]) {
    const r = await tryErr(run(asA, `select public.record_consent('terms', $1)`, [v]));
    if (r.ok) acc.push(JSON.stringify((await q(`select terms_version from public.profiles where id=$1`, [A]))[0].terms_version));
  }
  return { proven: acc.length > 0, evidence: `stored terms_version values accepted: ${acc.join(', ')}` };
});
await attack('4b', 'consent columns via insert / upsert / delete+insert of own profile', async () => {
  const r1 = await tryErr(run(asA, `insert into public.profiles (id, ai_consent_at) values ($1, now()) on conflict (id) do update set ai_consent_at = excluded.ai_consent_at`, [A]));
  const before = (await q(`select allergy_ack_at, allergies from public.profiles where id=$1`, [A]))[0];
  const del = await tryErr(run(asA, `delete from public.profiles where id=$1`, [A]));
  const r2 = await tryErr(run(asA, `insert into public.profiles (id, allergy_ack_at, terms_version) values ($1, '2020-01-01', 'v0')`, [A]));
  const r3 = await tryErr(run(asA, `insert into public.profiles (id, allergies) values ($1, '{peanuts}')`, [A]));
  const after = (await q(`select allergy_ack_at, allergies from public.profiles where id=$1`, [A]))[0];
  return { proven: r1.ok || r2.ok, evidence: `upsert=${r1.ok ? 'OK' : r1.code}; delete own profile=${del.ok ? 'OK' : del.code} (consent stamps erased: before ack=${!!before.allergy_ack_at}, after ack=${!!after?.allergy_ack_at}); insert back-dated=${r2.ok ? 'OK' : r2.code}; plain re-insert=${r3.ok ? 'OK' : r3.code}` };
});
await attack('4c', 'protect_consent_columns: can authenticated escape the role check (set role / reset role / set_config role)?', async () => {
  const o = [];
  for (const s of [`set role service_role`, `set role postgres`, `set session authorization postgres`]) { const r = await tryErr(run(asA, s)); o.push(`${s}=${r.ok ? 'OK' : r.code}`); }
  // The harness session user is a superuser, so SET ROLE always succeeds here. PostgREST never runs raw SQL for a client,
  // so this is not reachable through the API: reported as not proven.
  return { proven: false, evidence: `HARNESS ARTIFACT, not an API path: ${o.join('; ')}` };
});

// ================= 5. every public function as anon + authenticated =================
await attack('5a', 'functions in public executable by anon (pg_proc + has_function_privilege)', async () => {
  const rows = await q(`
    select p.oid::regprocedure::text sig, p.prosecdef secdef, p.prorettype::regtype::text ret, coalesce(array_to_string(p.proconfig, ','), '') cfg,
           has_function_privilege('anon', p.oid, 'execute') anon_x, has_function_privilege('authenticated', p.oid, 'execute') auth_x
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' order by 1`);
  const anon = rows.filter((r) => r.anon_x).map((r) => `${r.sig}${r.secdef ? '[DEFINER]' : ''}`);
  console.log('         all public functions:'); for (const r of rows) console.log(`           ${r.sig.padEnd(70)} definer=${r.secdef} anon=${r.anon_x} auth=${r.auth_x} ${r.cfg}`);
  const noPath = rows.filter((r) => !/search_path=/.test(r.cfg)).map((r) => r.sig);
  const defAnon = rows.filter((r) => r.secdef && r.anon_x && r.ret !== 'trigger').map((r) => r.sig);
  return { proven: defAnon.length > 0 || noPath.length > 0, evidence: `anon-executable: ${anon.length} (${anon.join(', ')}); SECURITY DEFINER non-trigger fns anon can run: ${JSON.stringify(defAnon)}; missing search_path: ${JSON.stringify(noPath)}` };
});
await attack('5b', 'actually call every public function as anon and authenticated with dummy args', async () => {
  const fns = await q(`select p.oid, p.proname, p.oid::regprocedure::text sig, p.prorettype::regtype::text ret,
      (select array_agg(t::regtype::text order by o) from unnest(p.proargtypes) with ordinality as a(t, o)) args, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname='public'`);
  const dummy = { uuid: `'${planA}'::uuid`, text: `'x'`, jsonb: `'[]'::jsonb`, boolean: 'false', integer: '1', numeric: '1', date: `'2026-11-02'::date`, 'text[]': `'{a}'::text[]` };
  const ok = [], unexpected = [];
  for (const f of fns) {
    const args = (f.args ?? []).map((t) => dummy[t] ?? `null::${t}`).join(',');
    const sql = f.ret === 'record' || /^setof|table/.test(f.ret) ? `select * from public.${f.proname}(${args})` : `select public.${f.proname}(${args})`;
    for (const [who, fn] of [['anon', asAnon], ['auth', asB]]) {
      const r = await tryErr(run(fn, sql));
      if (r.ok) ok.push(`${who}:${f.proname}`);
      else if (!['42501', '0A000', '28000', 'P0001'].includes(r.code) && !/trigger functions/.test(r.msg)) unexpected.push(`${who}:${f.proname}=${r.code}`);
    }
  }
  const sensitive = ok.filter((x) => /^anon:(claim_plan|record_gen|replace_meal|record_consent|apply_grocery|rebuild_grocery|user_is_plus)|^auth:(claim_plan|record_gen|replace_meal)/.test(x));
  return { proven: sensitive.length > 0, evidence: `succeeded: ${ok.join(' ')} | other errors: ${unexpected.join(' ')} | sensitive: ${JSON.stringify(sensitive)}` };
});
await attack('5c', 'cook_slots(planA) as anon / as B leaks A\'s plan contents? (invoker + RLS)', async () => {
  const an = (await run(asAnon, `select * from public.cook_slots($1, 2)`, [planA])).rows;
  const b = (await run(asB, `select * from public.cook_slots($1, 2)`, [planA])).rows;
  return { proven: an.length + b.length > 0, evidence: `anon rows=${an.length} B rows=${b.length}` };
});

// ================= 6. quotas / caps / info leak =================
await attack('6a', 'pantry_quota bypass: one bulk INSERT .. SELECT generate_series(1,250)', async () => {
  const r = await tryErr(run(asB, `insert into public.pantry_items (user_id, name) select $1, 'bulk'||g from generate_series(1,250) g`, [B]));
  const n = (await q(`select count(*)::int n from public.pantry_items where user_id=$1`, [B]))[0].n;
  return { proven: n > 200, evidence: `insert=${r.ok ? 'OK' : r.code + ' ' + r.msg}; rows=${n}` };
});
await attack('6b', 'pantry_quota bypass: fill to 200, then upsert/update tricks', async () => {
  await run(asB, `insert into public.pantry_items (user_id, name) select $1, 'p'||g from generate_series(1,200) g`, [B]);
  const up = await tryErr(run(asB, `insert into public.pantry_items (user_id, name) values ($1,'p1') on conflict (user_id, lower(name)) do update set shelf='x'`, [B]));
  const upd = await tryErr(run(asB, `update public.pantry_items set name = name || '-renamed' where user_id=$1 and name='p2'`, [B]));
  const extra = await tryErr(run(asB, `insert into public.pantry_items (user_id, name) values ($1,'p201')`, [B]));
  const n = (await q(`select count(*)::int n from public.pantry_items where user_id=$1`, [B]))[0].n;
  return { proven: n > 200, evidence: `rows=${n}; upsert=${up.ok ? 'OK' : up.code}; update=${upd.ok ? 'OK' : upd.code}; 201st=${extra.ok ? 'OK' : extra.code}` };
});
await attack('6c', 'experiment_events 500/day cap bypass by sending created_at in the past', async () => {
  const r = await tryErr(run(asA, `insert into public.experiment_events (user_id, install_id, experiment, variant, event, created_at)
    select $1,'i','e','v','ev', now() - interval '2 days' from generate_series(1,2000)`, [A]));
  const n = (await q(`select count(*)::int n from public.experiment_events where user_id=$1`, [A]))[0].n;
  return { proven: n > 500, evidence: `insert=${r.ok ? 'OK' : r.code + ' ' + r.msg}; rows stored for A in one call=${n} (cap is 500/day)` };
});
await attack('6d', 'experiment_events: back-date / future-date to poison analytics windows', async () => {
  const r = await tryErr(run(asA, `insert into public.experiment_events (user_id, install_id, experiment, variant, event, created_at) values ($1,'i','e','v','ev','infinity'),($1,'i','e','v','ev','1970-01-01')`, [A]));
  // The insert may succeed; what matters is whether the forged timestamps were STORED.
  const bad = (await q(`select count(*)::int n from public.experiment_events where user_id=$1 and (created_at = 'infinity' or created_at < now() - interval '1 day')`, [A]))[0].n;
  return { proven: bad > 0, evidence: r.ok ? `insert accepted; forged timestamps stored: ${bad}` : r.code };
});
await attack('6e', "user_is_plus(other_uuid) as authenticated leaks another user's subscription", async () => {
  await db.query(`insert into public.subscriptions (user_id, source, status, external_id) values ($1,'stripe','active','s1')`, [B]);
  const viaA = (await run(asA, `select public.user_is_plus($1) v`, [B])).rows[0].v;
  const viaB = (await run(asB, `select public.user_is_plus($1) v`, [B])).rows[0].v;
  const an = await tryErr(run(asAnon, `select public.user_is_plus($1) v`, [B]));
  return { proven: viaA === true, evidence: `A asks about B -> ${viaA}; B asks about self -> ${viaB}; anon -> ${an.ok ? an.v.rows[0].v : an.code}` };
});

// ================= 7. unbounded inputs =================
const MB = 1024 * 1024;
await attack('7a', 'pantry_items.shelf has no length limit (5 MB string)', async () => {
  const r = await tryErr(run(asA, `insert into public.pantry_items (user_id, name, shelf) values ($1,'bigshelf',repeat('S',$2::int))`, [A, 5 * MB]));
  const len = r.ok ? (await q(`select octet_length(shelf) n from public.pantry_items where user_id=$1 and name='bigshelf'`, [A]))[0].n : 0;
  return { proven: r.ok, evidence: r.ok ? `stored shelf of ${len} bytes` : r.code + ' ' + r.msg };
});
await attack('7b', 'grocery_items.unit has no length limit (5 MB string)', async () => {
  const l = (await q(`select id from public.grocery_lists where plan_id=$1`, [planA]))[0].id;
  const r = await tryErr(run(asA, `update public.grocery_items set unit = repeat('u',$2::int) where list_id=$1`, [l, 5 * MB]));
  const len = (await q(`select max(octet_length(unit)) n from public.grocery_items where list_id=$1`, [l]))[0].n;
  return { proven: r.ok && len >= 5 * MB, evidence: `update=${r.ok ? 'OK rows=' + r.v.affectedRows : r.code}; max unit bytes=${len}` };
});
await attack('7c', 'leftovers: no row quota (5000 rows in one call)', async () => {
  const r = await tryErr(run(asA, `insert into public.leftovers (user_id, recipe_id, servings) select $1,$2,1 from generate_series(1,5000)`, [A, PLAIN]));
  const n = (await q(`select count(*)::int n from public.leftovers where user_id=$1`, [A]))[0].n;
  return { proven: n >= 5000, evidence: `insert=${r.ok ? 'OK' : r.code}; rows=${n}` };
});
await attack('7d', 'meal_plans: week_start 9999-12-27 / 4713 BC / not a Monday, and unlimited plans (3000 weeks)', async () => {
  const r1 = await tryErr(run(asA, `insert into public.meal_plans (user_id, week_start) values ($1,'9999-12-27'),($1,'4713-01-01 BC'),($1,'2026-11-11')`, [A]));
  const r2 = await tryErr(run(asA, `insert into public.meal_plans (user_id, week_start) select $1, date '3000-01-06' + 7*g from generate_series(1,3000) g`, [A]));
  const n = (await q(`select count(*)::int n from public.meal_plans where user_id=$1`, [A]))[0].n;
  return { proven: r1.ok || r2.ok, evidence: `odd dates=${r1.ok ? 'OK' : r1.code}; bulk=${r2.ok ? 'OK' : r2.code}; A's plans=${n}` };
});
await attack('7e', 'grocery_lists: client can overwrite estimated_total_usd / pantry_savings_usd and insert lists for any own plan', async () => {
  const r = await tryErr(run(asA, `update public.grocery_lists set estimated_total_usd = 999999.99, pantry_savings_usd = -999999.99 where plan_id=$1`, [planA]));
  return { proven: r.ok && r.v.affectedRows > 0, evidence: r.ok ? `rows=${r.v.affectedRows} (own data only; cosmetic)` : r.code };
});
await attack('7f', 'apply_grocery_choices: patches array of 21 entries each carrying a 5 MB junk field', async () => {
  const big = 'x'.repeat(5 * MB);
  const patch = JSON.stringify(Array.from({ length: 21 }, () => ({ id: satayItem, status: 'cook', conflict: true, junk: big })));
  const t = Date.now();
  const r = await tryErr(run(asA, `select public.apply_grocery_choices($1,$2::jsonb,false)`, [planA, patch]));
  return { proven: r.ok, evidence: `${(patch.length / MB).toFixed(0)} MB payload ${r.ok ? 'accepted' : 'rejected ' + r.code} in ${Date.now() - t} ms (only array length is checked, not size)` };
});

const proven = results.filter((r) => r.proven).length;
console.log(`\n${proven} PROVEN / ${results.length - proven} BLOCKED of ${results.length}`);
process.exit(proven ? 1 : 0);   // regression test: any PROVEN attack fails the run
