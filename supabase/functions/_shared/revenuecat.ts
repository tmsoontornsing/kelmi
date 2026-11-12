// Turns a RevenueCat webhook event into the change we make to public.subscriptions. Pure, so it can be tested.
// RevenueCat docs: https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields

export const PLUS_ENTITLEMENT = "plus";

// Products that really never expire (a lifetime purchase). Only these may be recorded as active with no end date; any
// other purchase that arrives without a future expiration grants nothing. Kelmi sells no lifetime product today.
export const LIFETIME_PRODUCT_IDS: ReadonlySet<string> = new Set<string>();

export type RevenueCatEvent = {
  id?: string;
  type?: string;
  environment?: string;
  app_user_id?: string;
  product_id?: string;
  entitlement_ids?: string[] | null;
  expiration_at_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  period_type?: string;
  cancel_reason?: string;
  transaction_id?: string;
  original_transaction_id?: string;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
};

export type SubscriptionRow = {
  user_id: string;
  source: "revenuecat";
  status: "active" | "trialing" | "past_due" | "canceled" | "expired";
  period_end: string | null;
  external_id: string;
  // When RevenueCat says the event happened. An event older than the last one applied to the row is ignored, so a
  // retried or late event can never undo a newer one.
  event_ms: number;
};

export type Transfer = { from: string[]; to: string | null; event_ms: number };

export type ParseOptions = {
  // Sandbox purchases (TestFlight, store test accounts) only count when REVENUECAT_ALLOW_SANDBOX=1, which must never be
  // set in production.
  allowSandbox?: boolean;
  // Accounts whose sandbox purchases count in production: the App Review demo account and internal testers
  // (REVENUECAT_SANDBOX_USER_IDS, comma-separated user ids). Everyone else's sandbox events are ignored.
  sandboxUserIds?: ReadonlySet<string>;
  now?: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function sha256(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}

// Hash both sides and compare the digests in constant time, so neither the content nor the length of the secret can
// be learned from how long the check takes.
export async function secretMatches(given: string | null, expected: string): Promise<boolean> {
  if (given === null || !expected) return false;
  const [a, b] = await Promise.all([sha256(given), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function counts(event: RevenueCatEvent, opts: ParseOptions): boolean {
  if (event.environment === "PRODUCTION") return true;
  if (event.environment !== "SANDBOX") return false;
  return opts.allowSandbox === true || (!!event.app_user_id && opts.sandboxUserIds?.has(event.app_user_id.toLowerCase()) === true);
}

// A usable epoch-milliseconds value, or null.
const ms = (t: unknown): number | null =>
  typeof t === "number" && Number.isFinite(t) && t > 0 && t < 8.64e15 ? Math.floor(t) : null;

// RevenueCat always sends event_timestamp_ms. An event without one cannot be placed in order, so it is ignored rather
// than treated as the newest.
const eventMs = (event: RevenueCatEvent): number | null => ms(event.event_timestamp_ms);

// null means "nothing to record": a test ping, a sandbox event, an anonymous (not signed-in) buyer, another
// entitlement, a TRANSFER (see toTransfer), or an event type that does not change whether Plus is on.
export function toSubscriptionRow(event: RevenueCatEvent, opts: ParseOptions = {}): SubscriptionRow | null {
  const now = opts.now ?? Date.now();
  if (!counts(event, opts)) return null;
  const userId = event.app_user_id ?? "";
  if (!UUID.test(userId)) return null;
  // Only an event that names the Plus entitlement can touch a Plus row. Missing or null is not Plus.
  if (!Array.isArray(event.entitlement_ids) || !event.entitlement_ids.includes(PLUS_ENTITLEMENT)) return null;
  const externalId = event.original_transaction_id ?? event.transaction_id;
  if (!externalId) return null;

  const at = eventMs(event);
  if (at === null) return null;
  const expMs = ms(event.expiration_at_ms);
  const lifetime = expMs === null && !!event.product_id && LIFETIME_PRODUCT_IDS.has(event.product_id);
  const grantStatus: SubscriptionRow["status"] = event.period_type === "TRIAL" ? "trialing" : "active";
  let status: SubscriptionRow["status"];
  let periodEndMs = expMs;

  switch (event.type) {
    case "INITIAL_PURCHASE":
    case "RENEWAL":
    case "UNCANCELLATION":
    case "PRODUCT_CHANGE":
    case "NON_RENEWING_PURCHASE":
    case "SUBSCRIPTION_EXTENDED":
      // Never active with no end date, unless the product is a known lifetime one.
      if (expMs === null && !lifetime) return null;
      status = grantStatus;
      break;
    case "CANCELLATION":
      // Auto-renew switched off: they paid through the end of the period, so Plus runs out on its own date. A refund
      // (CUSTOMER_SUPPORT), or a cancellation with no future expiration, ends it now.
      if (event.cancel_reason === "CUSTOMER_SUPPORT" || expMs === null || expMs <= now) {
        status = "canceled";
      } else {
        status = grantStatus;
      }
      break;
    case "BILLING_ISSUE": {
      // The store keeps the entitlement during its grace period; Plus stays on until the grace period ends.
      const grace = ms(event.grace_period_expiration_at_ms);
      if (grace !== null && grace > now) {
        status = grantStatus;
        periodEndMs = grace;
      } else {
        status = "past_due";
      }
      break;
    }
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
    period_end: periodEndMs !== null ? new Date(periodEndMs).toISOString() : null,
    external_id: externalId,
    event_ms: at,
  };
}

// A TRANSFER (restore purchases on another account) moves the subscription: the old accounts lose it and the new one
// gets it, with the same end date. null when it is not a transfer we act on.
export function toTransfer(event: RevenueCatEvent, opts: ParseOptions = {}): Transfer | null {
  if (event.type !== "TRANSFER" || !counts(event, opts)) return null;
  const uuids = (xs: unknown) => (Array.isArray(xs) ? xs : []).filter((x): x is string => typeof x === "string" && UUID.test(x)).map((x) => x.toLowerCase());
  const from = uuids(event.transferred_from);
  if (from.length === 0) return null;
  const to = uuids(event.transferred_to)[0] ?? null;
  const at = eventMs(event);
  return at === null ? null : { from, to, event_ms: at };
}
