import { assertEquals } from "jsr:@std/assert@1";
import { secretMatches, toSubscriptionRow } from "./revenuecat.ts";

const user = "123e4567-e89b-12d3-a456-426614174000";
const base = { app_user_id: user, original_transaction_id: "tx1", entitlement_ids: ["plus"], expiration_at_ms: 1_800_000_000_000 };

Deno.test("a purchase becomes an active row", () => {
  const row = toSubscriptionRow({ ...base, type: "INITIAL_PURCHASE" });
  assertEquals(row?.status, "active");
  assertEquals(row?.external_id, "tx1");
  assertEquals(row?.period_end, new Date(1_800_000_000_000).toISOString());
});

Deno.test("a trial is trialing, a billing issue is past_due, expiry is expired", () => {
  assertEquals(toSubscriptionRow({ ...base, type: "INITIAL_PURCHASE", period_type: "TRIAL" })?.status, "trialing");
  assertEquals(toSubscriptionRow({ ...base, type: "BILLING_ISSUE" })?.status, "past_due");
  assertEquals(toSubscriptionRow({ ...base, type: "EXPIRATION" })?.status, "expired");
});

Deno.test("ignores anonymous buyers, other entitlements, tests and unknown events", () => {
  assertEquals(toSubscriptionRow({ ...base, type: "RENEWAL", app_user_id: "$RCAnonymousID:abc" }), null);
  assertEquals(toSubscriptionRow({ ...base, type: "RENEWAL", entitlement_ids: ["other"] }), null);
  assertEquals(toSubscriptionRow({ ...base, type: "TEST" }), null);
  assertEquals(toSubscriptionRow({ ...base, type: "TRANSFER" }), null);
});

Deno.test("cancelling keeps Plus active until the period ends", () => {
  assertEquals(toSubscriptionRow({ ...base, type: "CANCELLATION" })?.status, "active");
});

Deno.test("secretMatches", () => {
  assertEquals(secretMatches("abc", "abc"), true);
  assertEquals(secretMatches("abd", "abc"), false);
  assertEquals(secretMatches(null, "abc"), false);
  assertEquals(secretMatches("ab", "abc"), false);
});
