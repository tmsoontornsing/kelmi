// RED TEAM (local only): plan generation caps in claim_plan_generation / record_ai_attempt / record_generation_result,
// on PGlite. Run: node supabase/scripts/redteam/plan-caps.mjs
// Each attack prints PROVEN or BLOCKED with evidence; the script exits 1 if any is PROVEN (all were fixed by
// 20261116000100_billing_caps_hardening.sql). Calls are made as service_role (what generate-plan does), with the same
// sequence generate-plan/index.ts now sends: claim -> record_ai_attempt before every paid model request (not for a
// 'basic_only' claim or a household without AI consent) -> record_generation_result.
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const { makeDb, applyAll, as } = await import(pathToFileURL(path.resolve(here, '../pg-local-test/harness.mjs')).href);

const db = await makeDb();
const mig = await applyAll(db);
if (!mig.every((r) => r.ok)) throw new Error('migrations failed: ' + JSON.stringify(mig.filter((r) => !r.ok)));

const q = async (s, p) => (await db.query(s, p)).rows;
const svc = (s, p) => as(db, 'service_role', null, (d) => d.query(s, p)).then((r) => r.rows);
let n = 0;
const newUser = async (email) => {
  n++;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  await q(`insert into auth.users (id, email) values ($1,$2)`, [id, email ?? `u${n}@x.test`]);
  return id;
};
const claim = async (u, plus = false) => (await svc(`select * from public.claim_plan_generation($1,$2)`, [u, plus]))[0];
const attempt = (id) => svc(`select public.record_ai_attempt($1)`, [id]);
const record = (id, status, provider, model, inTok, outTok) =>
  svc(`select public.record_generation_result($1,$2,$3,$4,$5,$6)`, [id, status, provider, model, inTok, outTok]);
const MONTH_START = `(date_trunc('month', now() at time zone 'utc') at time zone 'utc')`;
const age = (u, mins = 11) =>
  q(`update public.plan_generations set created_at = greatest(created_at - make_interval(mins => $2), ${MONTH_START} + interval '1 second') where user_id = $1`, [u, mins]);
// Mirrors the daily-ceiling count in claim_plan_generation (20261116000100).
const dailyCount = async () => (await q(`select coalesce(sum(greatest(g.ai_attempts, 1)), 0)::int c from public.plan_generations g
  where g.created_at >= (date_trunc('day', now() at time zone 'utc') at time zone 'utc')
    and (g.ai_attempts > 0 or g.input_tokens > 0
      or (g.status = 'succeeded' and g.provider is not null and g.provider not in ('basic','none'))
      or (g.status = 'pending' and g.provider is null and g.created_at >= now() - interval '10 minutes'))`))[0].c;
const reset = () => q(`delete from public.plan_generations`);
let proven = 0;
const verdict = (id, isProven, title, evidence) => {
  if (isProven) proven++;
  console.log(`\n[${isProven ? 'PROVEN' : 'BLOCKED'}] ${id} ${title}\n  evidence: ${JSON.stringify(evidence)}`);
};

// ---------- B1: free user > 3 claims/month via failed rows with input_tokens = 0 ----------
{
  // AI-consented free user; Claude times out twice (0 tokens reported) and the built-in fallback also fails.
  await reset();
  const v = await newUser();
  let extra = 0;
  for (let i = 0; i < 20; i++) {
    const c = await claim(v);
    if (!c.allowed) break;
    extra++;
    await attempt(c.generation_id); await attempt(c.generation_id);
    await record(c.generation_id, 'failed', 'none', null, 0, 0);
    await age(v);
  }
  const after = await claim(v);
  // Timeout then built-in success: must count in the daily AI ceiling (two paid requests were sent).
  await reset();
  const w = await newUser();
  const c = await claim(w);
  await attempt(c.generation_id); await attempt(c.generation_id);
  await record(c.generation_id, 'succeeded', 'basic', null, 0, 0);
  const ceiling = await dailyCount();
  verdict('B1', extra > 3 || ceiling !== 2,
    'timed-out (0-token) paid requests escape the monthly cap and the daily AI ceiling',
    { claimsAllowedWithTimeouts: extra, thenDenied: after.reason, timeoutThenBasicSuccess_countsInCeiling: ceiling });
}

// ---------- B2: orphaned 'pending' rows never expire and lock the user out ----------
{
  await reset();
  const u = await newUser();
  for (let i = 0; i < 3; i++) { await claim(u); await age(u); }
  await q(`update public.plan_generations set created_at = ${MONTH_START} + interval '1 second' where user_id=$1`, [u]);
  const next = await claim(u);
  const rows = await q(`select status from public.plan_generations where user_id=$1 order by created_at`, [u]);
  // A crashed request that HAD sent a paid call still counts.
  await reset();
  const k = await newUser();
  for (let i = 0; i < 3; i++) { const c = await claim(k); await attempt(c.generation_id); await age(k); }
  await q(`update public.plan_generations set created_at = ${MONTH_START} + interval '1 second' where user_id=$1`, [k]);
  const killedAfterPaidCall = await claim(k);
  verdict('B2', !next.allowed || killedAfterPaidCall.allowed,
    "abandoned pending rows use up a free user's month forever",
    { claimAfter3Orphans: next.allowed, orphansNow: rows.map((r) => r.status), claimAfter3KilledPaidRequests: killedAfterPaidCall.reason });
}

// ---------- B3: many accounts exhaust the global 2000/day ceiling ----------
{
  await reset();
  const t0 = Date.now();
  let accounts = 0, aiClaims = 0, basicOnly = 0;
  outer: while (accounts < 1000) {
    const u = await newUser(); accounts++;
    for (let i = 0; i < 3; i++) {
      const c = await claim(u); if (!c.allowed) break;
      if (c.reason === 'basic_only') { basicOnly++; await record(c.generation_id, 'succeeded', 'basic', null, 0, 0); break outer; }
      aiClaims++;
      await attempt(c.generation_id);
      await record(c.generation_id, 'succeeded', 'claude', 'm', 1200, 900);
    }
  }
  const victimFree = await newUser();
  const victimPlus = await newUser();
  await q(`insert into public.subscriptions (user_id, source, status, period_end, external_id) values ($1,'revenuecat','active', now() + interval '30 days','rt-plus')`, [victimPlus]);
  const vf = await claim(victimFree), vp = await claim(victimPlus);
  verdict('B3', !(vp.allowed && vp.reason === null) || !vf.allowed,
    'free sign-ups exhaust the global ceiling and lock everyone out, Plus included',
    { attackerAccounts: accounts, attackerAiClaims: aiClaims, attackerDegradedToBasic: basicOnly, dailyCount: await dailyCount(),
      victimFree: { allowed: vf.allowed, reason: vf.reason }, victimPlus: { allowed: vp.allowed, reason: vp.reason, is_plus: vp.is_plus }, ms: Date.now() - t0 });
  if (vp.generation_id) await record(vp.generation_id, 'succeeded', 'claude', 'm', 1, 1);
  if (vf.generation_id) await record(vf.generation_id, 'succeeded', 'basic', null, 0, 0);
}

// ---------- B4: deleting the user (cascade) resets the counts ----------
{
  const before = await dailyCount();
  const victims = (await q(`select distinct user_id from public.plan_generations where provider='claude' and user_id is not null limit 50`)).map((r) => r.user_id);
  await q(`delete from auth.users where id = any($1::uuid[])`, [victims]);
  const after = await dailyCount();
  const orphaned = (await q(`select count(*)::int c from public.plan_generations where user_id is null`))[0].c;
  // Nobody can read the orphaned rows through RLS.
  const someone = await newUser();
  const visible = (await as(db, 'authenticated', someone, (d) => d.query(`select count(*)::int c from public.plan_generations where user_id is null`))).rows[0].c;
  verdict('B4', after < before || visible !== 0,
    'account deletion cascades plan_generations: the global daily ceiling forgets AI calls already paid for today',
    { ceilingCountBeforeDelete: before, afterDeleting50Accounts: after, rowsKeptWithNullUser: orphaned, nullRowsVisibleToAUser: visible,
      residual: 'the same email re-signing up gets a new uid and a fresh monthly cap (per-uid cap; not addressed here)' });
}

// ---------- B5: provider='none' failures count toward the ceiling ----------
{
  await reset();
  const u = await newUser();
  // Household without AI consent: no model call, built-in planner fails.
  const c1 = await claim(u); await record(c1.generation_id, 'failed', 'none', null, 0, 0);
  const noneCounts = await dailyCount();
  await reset();
  const c2 = await claim(u); await record(c2.generation_id, 'succeeded', 'basic', null, 0, 0);
  const basicCounts = await dailyCount();
  verdict('B5', noneCounts !== 0 || basicCounts !== 0,
    "a non-AI failure (failed/'none'/0 tokens, no paid request) burns shared AI budget",
    { failedNoneNoAttemptCountsInCeiling: noneCounts, succeededBasicCountsInCeiling: basicCounts });
}

// ---------- extra: record_ai_attempt on a basic_only claim is refused ----------
{
  await reset();
  await q(`insert into public.plan_generations (user_id, status, provider, ai_attempts) select null, 'succeeded', 'claude', 1 from generate_series(1, 2000)`);
  const u = await newUser();
  const c = await claim(u);
  let refused = false;
  try { await attempt(c.generation_id); } catch { refused = true; }
  verdict('B6', c.reason !== 'basic_only' || !refused, 'a basic_only claim can still record (and so make) a paid request',
    { claim: c.reason, recordAttemptRefused: refused });
}

console.log(`\n${proven === 0 ? 'all BLOCKED' : proven + ' PROVEN'}`);
process.exit(proven === 0 ? 0 : 1);
