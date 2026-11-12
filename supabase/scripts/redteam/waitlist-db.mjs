// Red-team: waitlist + service-only RPCs against the real migrations on PGlite (in-memory Postgres). LOCAL ONLY.
//   node supabase/scripts/redteam/waitlist-db.mjs
// Reuses ../pg-local-test (needs its node_modules: cd ../pg-local-test && npm i --no-save @electric-sql/pglite).
import { applyAll, as, makeDb } from '../pg-local-test/harness.mjs';

const out = (verdict, attack, evidence) => console.log(`\n[${verdict}] ${attack}\n    ${evidence}`);
const db = await makeDb();
const applied = await applyAll(db);
const bad = applied.filter((a) => !a.ok);
if (bad.length) { console.error('migrations failed', bad); process.exit(1); }

const anon = (sql, params) => as(db, 'anon', null, (d) => d.query(sql, params));
const authed = (sql, params) => as(db, 'authenticated', '00000000-0000-4000-8000-000000000001', (d) => d.query(sql, params));
const err = async (p) => { try { await p; return null; } catch (e) { return e; } };

const svc = (sql, params) => as(db, 'service_role', null, (d) => d.query(sql, params));
const join = (email) => svc(`select public.join_waitlist($1, 'waitlist-2026-11-05')`, [email]);

// 1. Existence oracle: anon can no longer insert at all, and join_waitlist answers a duplicate exactly like a new address.
await join('victim@example.com');
const a1 = await err(anon(`insert into public.waitlist (email) values ('victim@example.com')`));
const a2 = await err(anon(`insert into public.waitlist (email) values ('stranger@example.com')`));
const r1 = await err(join('victim@example.com'));
const r2 = await err(join('stranger@example.com'));
const anonBlocked = a1?.code === '42501' && a2?.code === '42501';
out(anonBlocked && !r1 && !r2 ? 'BLOCKED' : 'PROVEN',
  'waitlist: insert distinguishes on-list vs new address (PostgREST 409 vs 201)',
  `anon insert known: ${a1?.code ?? 'ok'}, new: ${a2?.code ?? 'ok'} (no insert grant); join_waitlist known: ${r1?.code ?? 'ok (void)'}, new: ${r2?.code ?? 'ok (void)'} -> same answer (on conflict do nothing).`);

const n0 = (await db.query(`select count(*)::int n from public.waitlist`)).rows[0].n;
let probeErr = null;
for (let i = 0; i < 100; i++) probeErr = (await err(anon(`select public.join_waitlist('victim@example.com', 'waitlist-2026-11-05')`))) ?? probeErr;
const n1 = (await db.query(`select count(*)::int n from public.waitlist`)).rows[0].n;
out(probeErr?.code === '42501' && n1 === n0 ? 'BLOCKED' : 'PROVEN', 'waitlist oracle is unthrottled for repeat probes of on-list addresses',
  `anon cannot execute join_waitlist (${probeErr?.code}); the only caller is the website's server route (service role), whose answer is the same for every address. Rows added: ${n1 - n0}.`);

// 2. Table-wide throttle as a DoS: anon can no longer add junk rows at all.
await db.query(`delete from public.waitlist`);
let junkErr = null;
for (let i = 0; i < 30; i++) junkErr = (await err(anon(`insert into public.waitlist (email, consent_version) values ($1, 'waitlist-2026-11-05')`, [`junk${i}@spam.example`]))) ?? junkErr;
const real = await err(join('real.person@gmail.com'));
out(junkErr?.code === '42501' && !real ? 'BLOCKED' : 'PROVEN',
  'waitlist: 30 junk inserts per minute deny every real sign-up (table-wide throttle)',
  `30 anon junk inserts -> ${junkErr?.code ?? 'accepted'}; real sign-up via join_waitlist -> ${real ? `${real.code} ${real.hint ?? ''}` : 'accepted'}. Throttle now 120/min, 2000/h and reachable only through the website (per-IP limited).`);

// 3. Missing consent: no path inserts without consent_version any more.
await db.query(`delete from public.waitlist`);
const e3 = await err(anon(`insert into public.waitlist (email) values ('noconsent@example.com')`));
const e4 = await err(db.query(`insert into public.waitlist (email) values ('noconsent2@example.com')`));
const e5 = await err(svc(`select public.join_waitlist('noconsent3@example.com', null)`));
out(e3 && e4 && e5 ? 'BLOCKED' : 'PROVEN', 'waitlist: row without consent_version accepted (bypasses the web route\'s consent stamp)',
  `anon insert -> ${e3?.code ?? 'accepted'}; even a superuser insert without it -> ${e4?.code ?? 'accepted'} (NOT VALID check, new rows only); join_waitlist(null) -> ${e5?.code ?? 'accepted'}`);

// 4. Service-only RPCs through rest/v1/rpc (forwarded by the gateway) are refused by grants.
const rpcs = [
  [`select public.claim_plan_generation('00000000-0000-4000-8000-000000000001'::uuid, false)`, 'claim_plan_generation'],
  [`select public.replace_meal_plan('00000000-0000-4000-8000-000000000001'::uuid, '2026-11-16', '[]'::jsonb)`, 'replace_meal_plan'],
  [`select public.record_generation_result(gen_random_uuid(), 'succeeded', 'basic', null, 0, 0)`, 'record_generation_result'],
  [`select public.join_waitlist('x@example.com', 'waitlist-2026-11-05')`, 'join_waitlist'],
];
const rows = [];
for (const [sql, name] of rpcs) {
  const a = await err(anon(sql)); const u = await err(authed(sql));
  rows.push(`${name}: anon=${a?.code ?? 'ALLOWED'} authenticated=${u?.code ?? 'ALLOWED'}`);
}
out(rows.every((r) => !r.includes('ALLOWED')) ? 'BLOCKED' : 'PROVEN', 'gateway -> rest/v1/rpc/<service-only fn> as anon/authenticated', rows.join(' | '));
