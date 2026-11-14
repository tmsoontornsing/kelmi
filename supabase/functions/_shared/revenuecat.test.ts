import { assertEquals } from "jsr:@std/assert@1";
import { deleteRevenueCatCustomer, secretMatches, toSubscriptionRow, toTransfer } from "./revenuecat.ts";

const user = "123e4567-e89b-12d3-a456-426614174000";
const other = "223e4567-e89b-12d3-a456-426614174000";
const now = 1_700_000_000_000;
const exp = 1_800_000_000_000;
const base = {
  environment: "PRODUCTION",
  app_user_id: user,
  original_transaction_id: "tx1",
  entitlement_ids: ["plus"],
  expiration_at_ms: exp,
  event_timestamp_ms: now - 5,
};
const row = (e: Record<string, unknown>, opts: { allowSandbox?: boolean; sandboxUserIds?: ReadonlySet<string> } = {}) => toSubscriptionRow({ ...base, ...e }, { now, ...opts });

Deno.test("a purchase becomes an active row carrying its event time", () => {
  const r = row({ type: "INITIAL_PURCHASE" });
  assertEquals(r?.status, "active");
  assertEquals(r?.external_id, "tx1");
  assertEquals(r?.period_end, new Date(exp).toISOString());
  assertEquals(r?.event_ms, now - 5);
  // No (or a nonsense) event time: it cannot be ordered, so it is ignored.
  assertEquals(row({ type: "RENEWAL", event_timestamp_ms: undefined }), null);
  assertEquals(row({ type: "RENEWAL", event_timestamp_ms: 1e20 }), null);
  // An expiration out of range is treated as missing, not thrown on.
  assertEquals(row({ type: "RENEWAL", expiration_at_ms: 1e20 }), null);
});

Deno.test("a trial is trialing, an expiry is expired", () => {
  assertEquals(row({ type: "INITIAL_PURCHASE", period_type: "TRIAL" })?.status, "trialing");
  assertEquals(row({ type: "EXPIRATION" })?.status, "expired");
});

Deno.test("sandbox events are ignored unless allowed; a missing environment is not production", () => {
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: "SANDBOX" }), null);
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: undefined }), null);
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: "SANDBOX" }, { allowSandbox: true })?.status, "active");
});

Deno.test("sandbox purchases count only for listed test accounts (App Review demo)", () => {
  const listed = new Set([user]);
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: "SANDBOX" }, { sandboxUserIds: listed })?.status, "active");
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: "SANDBOX" }, { sandboxUserIds: new Set(["00000000-0000-4000-8000-000000000000"]) }), null);
  assertEquals(row({ type: "INITIAL_PURCHASE", environment: undefined }, { sandboxUserIds: listed }), null);
});

Deno.test("only an event naming the plus entitlement counts", () => {
  assertEquals(row({ type: "NON_RENEWING_PURCHASE", entitlement_ids: null }), null);
  assertEquals(row({ type: "NON_RENEWING_PURCHASE", entitlement_ids: undefined }), null);
  assertEquals(row({ type: "NON_RENEWING_PURCHASE", entitlement_ids: [] }), null);
  assertEquals(row({ type: "RENEWAL", entitlement_ids: ["other"] }), null);
  assertEquals(row({ type: "RENEWAL", entitlement_ids: "plus" }), null);
});

Deno.test("ignores anonymous buyers, tests and unknown events; TRANSFER is not a row", () => {
  assertEquals(row({ type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" }), null);
  assertEquals(row({ type: "TEST" }), null);
  assertEquals(row({ type: "TRANSFER" }), null);
});

Deno.test("a purchase with no expiration grants nothing (no lifetime product is sold)", () => {
  assertEquals(row({ type: "NON_RENEWING_PURCHASE", expiration_at_ms: null }), null);
  assertEquals(row({ type: "INITIAL_PURCHASE", expiration_at_ms: undefined }), null);
});

Deno.test("cancelling keeps Plus until the period ends; a refund or no future expiry ends it now", () => {
  assertEquals(row({ type: "CANCELLATION" })?.status, "active");
  assertEquals(row({ type: "CANCELLATION", cancel_reason: "CUSTOMER_SUPPORT" })?.status, "canceled");
  assertEquals(row({ type: "CANCELLATION", expiration_at_ms: null })?.status, "canceled");
  assertEquals(row({ type: "CANCELLATION", expiration_at_ms: now - 1 })?.status, "canceled");
});

Deno.test("a billing issue keeps Plus through the grace period, then past_due", () => {
  const grace = row({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: now + 1000 });
  assertEquals(grace?.status, "active");
  assertEquals(grace?.period_end, new Date(now + 1000).toISOString());
  assertEquals(row({ type: "BILLING_ISSUE" })?.status, "past_due");
  assertEquals(row({ type: "BILLING_ISSUE", grace_period_expiration_at_ms: now - 1 })?.status, "past_due");
});

Deno.test("toTransfer moves from the old accounts to the first signed-in recipient", () => {
  const t = toTransfer({ type: "TRANSFER", environment: "PRODUCTION", transferred_from: [user, "$RCAnonymousID:x"], transferred_to: [other.toUpperCase()], event_timestamp_ms: 7 });
  assertEquals(t, { from: [user], to: other, event_ms: 7 });
  assertEquals(toTransfer({ type: "TRANSFER", environment: "PRODUCTION", transferred_from: [user], transferred_to: ["$RCAnonymousID:y"], event_timestamp_ms: 8 }, { now })?.to, null);
  assertEquals(toTransfer({ type: "TRANSFER", environment: "PRODUCTION", transferred_from: [user], transferred_to: [other] }), null);
  assertEquals(toTransfer({ type: "TRANSFER", environment: "SANDBOX", transferred_from: [user], transferred_to: [other] }), null);
  assertEquals(toTransfer({ type: "RENEWAL", environment: "PRODUCTION", transferred_from: [user] }), null);
});

Deno.test("secretMatches", async () => {
  assertEquals(await secretMatches("abc", "abc"), true);
  assertEquals(await secretMatches("abd", "abc"), false);
  assertEquals(await secretMatches(null, "abc"), false);
  assertEquals(await secretMatches("ab", "abc"), false);
  assertEquals(await secretMatches("", ""), false);
});

Deno.test("deleting a RevenueCat customer calls DELETE with the secret key and the encoded user id", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;
  assertEquals(await deleteRevenueCatCustomer(user, "sk_test", fake), { result: "deleted", status: 200 });
  assertEquals(calls[0].url, `https://api.revenuecat.com/v1/subscribers/${user}`);
  assertEquals(calls[0].init?.method, "DELETE");
  assertEquals((calls[0].init?.headers as Record<string, string>).Authorization, "Bearer sk_test");
});

Deno.test("deleting a RevenueCat customer: no key skips, 404 counts as deleted, errors fail without throwing", async () => {
  const status = (s: number) => (() => Promise.resolve(new Response(null, { status: s }))) as unknown as typeof fetch;
  assertEquals(await deleteRevenueCatCustomer(user, undefined, status(200)), { result: "skipped" });
  assertEquals(await deleteRevenueCatCustomer(user, "sk_test", status(404)), { result: "deleted", status: 404 });
  assertEquals(await deleteRevenueCatCustomer(user, "sk_test", status(500)), { result: "failed", status: 500 });
  const down = (() => Promise.reject(new Error("network"))) as unknown as typeof fetch;
  assertEquals(await deleteRevenueCatCustomer(user, "sk_test", down), { result: "failed" });
});
