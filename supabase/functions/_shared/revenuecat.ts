// Turns a RevenueCat webhook event into the row we keep in public.subscriptions. Pure, so it can be tested.
// RevenueCat docs: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

export const PLUS_ENTITLEMENT = "plus";

export type RevenueCatEvent = {
  type?: string;
  app_user_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  period_type?: string;
  transaction_id?: string;
  original_transaction_id?: string;
};

export type SubscriptionRow = {
  user_id: string;
  source: "revenuecat";
  status: "active" | "trialing" | "past_due" | "canceled" | "expired";
  period_end: string | null;
  external_id: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Compare in constant time so the secret can't be guessed a character at a time.
export function secretMatches(given: string | null, expected: string): boolean {
  if (!given || given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

// null means "nothing to record": a test ping, an anonymous (not signed-in) buyer, another entitlement, or an event
// type that does not change whether Plus is on.
export function toSubscriptionRow(event: RevenueCatEvent): SubscriptionRow | null {
  const userId = event.app_user_id ?? "";
  if (!UUID.test(userId)) return null;
  if (event.entitlement_ids && !event.entitlement_ids.includes(PLUS_ENTITLEMENT)) return null;
  const externalId = event.original_transaction_id ?? event.transaction_id;
  if (!externalId) return null;

  let status: SubscriptionRow["status"];
  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
    case "SUBSCRIPTION_EXTENDED":
    // Auto-renew was switched off, but they paid through the end of the period. user_is_plus only counts active and
    // trialing rows that have not reached period_end, so keeping this active lets Plus run out on its own date (a
    // refund arrives with a past expiration, so it ends at once).
    case "CANCELLATION":
      status = event.period_type === "TRIAL" ? "trialing" : "active";
      break;
    case "BILLING_ISSUE":
      status = "past_due";
      break;
    case "EXPIRATION":
      status = "expired";
      break;
    default:
      return null;
  }
  return {
    user_id: userId.toLowerCase(),
    source: "revenuecat",
    status,
    period_end: event.expiration_at_ms ? new Date(event.expiration_at_ms).toISOString() : null,
    external_id: externalId,
  };
}
