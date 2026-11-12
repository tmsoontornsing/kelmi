// RED TEAM (local only): RevenueCat webhook logic against a real, fully migrated PGlite database.
// Run (offline):
//   cd supabase/scripts/redteam && deno test --no-check --node-modules-dir=manual --deny-net --allow-read --allow-env billing.test.ts
// Every attack prints PROVEN or BLOCKED with evidence, and a test FAILS if an attack is PROVEN (they were all fixed by
// 20261116000100_billing_caps_hardening.sql and the new revenuecat.ts). Nothing here touches the network, a cloud
// project or a real key.
import { assert } from "jsr:@std/assert@1";
import { secretMatches, toSubscriptionRow, toTransfer, type RevenueCatEvent, type SubscriptionRow } from "../../functions/_shared/revenuecat.ts";
// @ts-ignore: plain .mjs harness
import { applyAll, as, makeDb } from "../pg-local-test/harness.mjs";

// deno-lint-ignore no-explicit-any
const db: any = await makeDb();
// deno-lint-ignore no-explicit-any
const mig: any[] = await applyAll(db);
if (!mig.every((r) => r.ok)) throw new Error("migrations failed: " + JSON.stringify(mig.filter((r) => !r.ok)));

let n = 0;
async function newUser(): Promise<string> {
  n++;
  const id = `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  await db.query(`insert into auth.users (id, email) values ($1, $2)`, [id, `rt${n}@x.test`]);
  return id;
}

// deno-lint-ignore no-explicit-any
const svc = (sql: string, params: unknown[]) => as(db, "service_role", null, (d: any) => d.query(sql, params));

// Exactly what revenuecat-webhook/index.ts does (REVENUECAT_ALLOW_SANDBOX unset): a TRANSFER goes to
// transfer_subscriptions, everything else through toSubscriptionRow to apply_subscription_event, as the service role.
async function deliver(event: RevenueCatEvent & Record<string, unknown>): Promise<SubscriptionRow | "transfer" | null> {
  const transfer = toTransfer(event);
  if (transfer) {
    await svc(`select public.transfer_subscriptions($1::uuid[], $2::uuid, $3)`, [transfer.from, transfer.to, transfer.event_ms]);
    return "transfer";
  }
  const row = toSubscriptionRow(event);
  if (!row) return null;
  await svc(`select public.apply_subscription_event($1, $2, $3, $4, $5, $6)`,
    [row.user_id, row.source, row.external_id, row.status, row.period_end, row.event_ms]);
  return row;
}
const isPlus = async (u: string): Promise<boolean> => (await db.query(`select public.user_is_plus($1) p`, [u])).rows[0].p;
const claimIsPlus = async (u: string): Promise<boolean> =>
  (await db.query(`select is_plus from public.claim_plan_generation($1, false)`, [u])).rows[0].is_plus;
const subRow = async (u: string) =>
  (await db.query(`select status, period_end, last_event_ms from public.subscriptions where user_id = $1`, [u])).rows;

const DAY = 86_400_000;
const now = Date.now();
const PROD = { environment: "PRODUCTION" };
const verdict = (id: string, proven: boolean, title: string, evidence: unknown) => {
  console.log(`\n[${proven ? "PROVEN" : "BLOCKED"}] ${id} ${title}\n  evidence: ${JSON.stringify(evidence)}`);
  assert(!proven, `${id} is exploitable again`);
};

Deno.test("A1 SANDBOX environment event grants Plus in the production table", async () => {
  const u = await newUser();
  const row = await deliver({
    type: "INITIAL_PURCHASE", environment: "SANDBOX", app_user_id: u, original_transaction_id: "sbx-1", event_timestamp_ms: now,
    entitlement_ids: ["plus"], expiration_at_ms: now + 7 * DAY,
  });
  const plus = await isPlus(u);
  verdict("A1", plus, "SANDBOX purchase -> user_is_plus", { row, user_is_plus: plus, claim_is_plus: await claimIsPlus(u) });
});

Deno.test("A2 null / missing entitlement_ids is treated as Plus", async () => {
  const out: Record<string, unknown> = {};
  for (const [label, ents] of [["null", null], ["missing", undefined], ["empty []", []], ["other", ["coins"]]] as const) {
    const u = await newUser();
    const ev: RevenueCatEvent = { ...PROD, type: "NON_RENEWING_PURCHASE", app_user_id: u, transaction_id: `ent-${label}`, expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now };
    if (ents !== undefined) ev.entitlement_ids = ents as string[] | null;
    const row = await deliver(ev);
    // deno-lint-ignore no-explicit-any
    const r = row as any;
    out[label] = { status: r?.status ?? "ignored", user_is_plus: await isPlus(u) };
  }
  // deno-lint-ignore no-explicit-any
  const o = out as any;
  verdict("A2", o["null"].user_is_plus || o["missing"].user_is_plus || o["empty []"].user_is_plus || o["other"].user_is_plus,
    "a purchase with no Plus entitlement grants Plus", out);
});

Deno.test("A3a older EXPIRATION delivered after a newer RENEWAL downgrades a paying user", async () => {
  const u = await newUser();
  const base = { ...PROD, app_user_id: u, original_transaction_id: "ord-1", entitlement_ids: ["plus"] };
  await deliver({ ...base, type: "RENEWAL", expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now });
  const before = await isPlus(u);
  await deliver({ ...base, type: "EXPIRATION", expiration_at_ms: now - DAY, event_timestamp_ms: now - DAY });
  const after = await isPlus(u);
  // Same event delivered twice changes nothing either.
  await deliver({ ...base, type: "RENEWAL", expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now });
  verdict("A3a", before && !after, "late EXPIRATION overwrites newer RENEWAL", { before, after, row: await subRow(u) });
});

Deno.test("A3b refund (CANCELLATION, past expiry) then a late/retried RENEWAL re-grants Plus", async () => {
  const u = await newUser();
  const base = { ...PROD, app_user_id: u, original_transaction_id: "ord-2", entitlement_ids: ["plus"] };
  await deliver({ ...base, type: "RENEWAL", expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now - 3 * DAY });
  await deliver({ ...base, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: now - 1000, event_timestamp_ms: now - 1000 });
  const afterRefund = await isPlus(u);
  await deliver({ ...base, type: "RENEWAL", expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now - 2 * DAY });
  const afterLate = await isPlus(u);
  verdict("A3b", !afterRefund && afterLate, "late RENEWAL after a refund restores Plus for a full period",
    { afterRefund, afterLateRenewal: afterLate, row: await subRow(u) });
});

Deno.test("A4 missing expiration_at_ms -> period_end null -> Plus forever, even after CANCELLATION/refund", async () => {
  const u = await newUser();
  const base = { ...PROD, app_user_id: u, original_transaction_id: "noexp-1", entitlement_ids: ["plus"] };
  const r1 = await deliver({ ...base, type: "NON_RENEWING_PURCHASE", event_timestamp_ms: now - 10 });
  const p1 = await isPlus(u);
  // And a subscription that WAS active (with an end date), refunded with no expiration: canceled at once.
  const v = await newUser();
  const vb = { ...PROD, app_user_id: v, original_transaction_id: "noexp-2", entitlement_ids: ["plus"] };
  await deliver({ ...vb, type: "INITIAL_PURCHASE", expiration_at_ms: now + 30 * DAY, event_timestamp_ms: now - 10 });
  await deliver({ ...vb, type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT", expiration_at_ms: null, event_timestamp_ms: now });
  const p2 = await isPlus(v);
  const nullActive = (await db.query(
    `select count(*)::int c from public.subscriptions where status in ('active','trialing') and period_end is null and user_id = any($1::uuid[])`, [[u, v]])).rows[0].c;
  verdict("A4", p1 || p2 || nullActive > 0, "refunded / no-expiry purchase stays Plus indefinitely",
    { noExpiryPurchaseRow: r1, noExpiryPurchaseIsPlus: p1, refundedNoExpiryIsPlus: p2, activeRowsWithNullEnd: nullActive, rows: await subRow(v) });
});

Deno.test("A5 secretMatches leaks the secret length (early return)", async () => {
  const secret = "s".repeat(64);
  // Both sides are SHA-256 hashed and the 32-byte digests compared with an OR-accumulator: the work does not depend on
  // where the first difference is, nor on the length of what was sent.
  const src = await Deno.readTextFile(new URL("../../functions/_shared/revenuecat.ts", import.meta.url));
  const fn = src.slice(src.indexOf("export async function secretMatches"));
  const earlyLength = /given\.length\s*!==/.test(fn.slice(0, fn.indexOf("\n}\n")));
  const time = async (g: string) => { const t = performance.now(); for (let i = 0; i < 5_000; i++) await secretMatches(g, secret); return performance.now() - t; };
  await time("x".repeat(64)); await time("x");
  const tWrong = await time("x".repeat(63)), tRight = await time("x".repeat(64));
  const ok = (await secretMatches(secret, secret)) && !(await secretMatches("s".repeat(63), secret)) && !(await secretMatches("x" + "s".repeat(63), secret));
  verdict("A5", earlyLength || !ok, "length mismatch returns before any work",
    { lengthShortCircuitInSource: earlyLength, correct: ok, ms_5k_len63: +tWrong.toFixed(1), ms_5k_len64: +tRight.toFixed(1) });
});

Deno.test("A6 TRANSFER is ignored: old owner keeps Plus, new owner gets none until the next renewal", async () => {
  const a = await newUser(), b = await newUser();
  const tx = { ...PROD, original_transaction_id: "xfer-1", entitlement_ids: ["plus"], expiration_at_ms: now + 30 * DAY };
  await deliver({ ...tx, type: "INITIAL_PURCHASE", app_user_id: a, event_timestamp_ms: now - 10 });
  // Restore purchases on a different account (B) -> RevenueCat sends TRANSFER from A to B.
  const r = await deliver({ ...PROD, type: "TRANSFER", transferred_from: [a], transferred_to: [b], event_timestamp_ms: now });
  const aPlus = await isPlus(a), bPlus = await isPlus(b);
  // Transfer to an anonymous id: the old owner loses it, nobody gains it.
  const c = await newUser();
  await deliver({ ...tx, original_transaction_id: "xfer-2", type: "INITIAL_PURCHASE", app_user_id: c, event_timestamp_ms: now - 10 });
  await deliver({ ...PROD, type: "TRANSFER", transferred_from: [c], transferred_to: ["$RCAnonymousID:zz"], event_timestamp_ms: now });
  const cPlus = await isPlus(c);
  verdict("A6", r === null || aPlus || !bPlus || cPlus,
    "TRANSFER ignored: source account keeps Plus, recipient is not Plus",
    { transfer: r, afterTransfer: { A: aPlus, B: bPlus }, toAnonymous_sourceStillPlus: cPlus });
});

Deno.test("A7 BILLING_ISSUE during the store grace period", async () => {
  const u = await newUser();
  const base = { ...PROD, app_user_id: u, original_transaction_id: "grace-1", entitlement_ids: ["plus"] };
  await deliver({ ...base, type: "RENEWAL", expiration_at_ms: now - 1000, event_timestamp_ms: now - 30 * DAY });
  const row = await deliver({ ...base, type: "BILLING_ISSUE", expiration_at_ms: now - 1000, grace_period_expiration_at_ms: now + 16 * DAY, event_timestamp_ms: now });
  const plus = await isPlus(u);
  // After the grace period with no recovery, EXPIRATION ends it.
  await deliver({ ...base, type: "EXPIRATION", expiration_at_ms: now + 16 * DAY, event_timestamp_ms: now + 1 });
  const afterExpiry = await isPlus(u);
  verdict("A7", !plus || afterExpiry,
    "BILLING_ISSUE -> Plus removed immediately even though the store grants a grace period",
    { row, user_is_plus_in_grace: plus, after_expiration: afterExpiry });
});

Deno.test("webhook-only functions are service-role only", async () => {
  const u = await newUser();
  let denied = 0;
  for (const role of ["anon", "authenticated"]) {
    // deno-lint-ignore no-explicit-any
    try { await as(db, role, role === "anon" ? null : u, (d: any) => d.query(`select public.apply_subscription_event($1,'revenuecat','x','active',null,1)`, [u])); } catch { denied++; }
    // deno-lint-ignore no-explicit-any
    try { await as(db, role, role === "anon" ? null : u, (d: any) => d.query(`select public.transfer_subscriptions(array[$1]::uuid[],$1,1)`, [u])); } catch { denied++; }
  }
  // An event with no timestamp cannot be ordered: ignored, so a replay of an old grant cannot look newest.
  const t = await newUser();
  await deliver({ ...PROD, type: "RENEWAL", app_user_id: t, original_transaction_id: "nots-1", entitlement_ids: ["plus"], expiration_at_ms: now + 30 * DAY });
  const noTsPlus = await isPlus(t);
  verdict("A9", noTsPlus, "an event without event_timestamp_ms is applied as if it were the newest", { user_is_plus: noTsPlus });
  verdict("A8", denied !== 4, "anon/authenticated can call apply_subscription_event / transfer_subscriptions", { denied });
});
