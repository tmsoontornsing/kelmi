import { adminClient, fail, json } from "../_shared/http.ts";
import { secretMatches, toSubscriptionRow, toTransfer, type RevenueCatEvent } from "../_shared/revenuecat.ts";

// POST from RevenueCat, Authorization: <REVENUECAT_WEBHOOK_SECRET>
//
// Keeps public.subscriptions in step with the store, which is what the server trusts for Plus limits (the app's own
// idea of "subscribed" is only for showing the UI). Set the same secret here (supabase secrets set
// REVENUECAT_WEBHOOK_SECRET=...) and as the "Authorization header value" in RevenueCat > Integrations > Webhooks.
// Writes go through service-role-only database functions that apply an event only when it is newer than the last one
// applied to that subscription, so retried or out-of-order deliveries cannot undo a newer state.
// Sandbox events are ignored unless REVENUECAT_ALLOW_SANDBOX=1 (never set it in production).

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!secret) return fail("revenuecat-webhook", "not_configured", "REVENUECAT_WEBHOOK_SECRET is not set");
  if (!(await secretMatches(req.headers.get("Authorization"), secret))) return json({ error: "unauthorized" }, 401);

  let event: RevenueCatEvent;
  try {
    event = (await req.json()).event;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  if (!event || typeof event !== "object") return json({ ignored: true });
  const opts = {
    allowSandbox: Deno.env.get("REVENUECAT_ALLOW_SANDBOX") === "1",
    sandboxUserIds: new Set(
      (Deno.env.get("REVENUECAT_SANDBOX_USER_IDS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
    ),
  };

  const transfer = toTransfer(event, opts);
  if (transfer) {
    const { error } = await adminClient().rpc("transfer_subscriptions", {
      p_from: transfer.from,
      p_to: transfer.to,
      p_event_ms: transfer.event_ms,
    });
    // 23503: the recipient account was deleted. Retrying would never succeed.
    if (error && error.code !== "23503") return fail("revenuecat-webhook", "write_failed", error.message);
    return json({ ok: true });
  }

  const row = toSubscriptionRow(event, opts);
  // Nothing to record (a test ping, a sandbox event, an anonymous buyer): acknowledge so RevenueCat doesn't retry.
  if (!row) return json({ ignored: true });

  const { error } = await adminClient().rpc("apply_subscription_event", {
    p_user: row.user_id,
    p_source: row.source,
    p_external_id: row.external_id,
    p_status: row.status,
    p_period_end: row.period_end,
    p_event_ms: row.event_ms,
  });
  // 23503: the user was deleted, so there is no account left to attach this to. Retrying would never succeed.
  if (error && error.code !== "23503") return fail("revenuecat-webhook", "write_failed", error.message);
  return json({ ok: true });
});
