import { adminClient, fail, json } from "../_shared/http.ts";
import { secretMatches, toSubscriptionRow, type RevenueCatEvent } from "../_shared/revenuecat.ts";

// POST from RevenueCat, Authorization: <REVENUECAT_WEBHOOK_SECRET>
//
// Keeps public.subscriptions in step with the store, which is what the server trusts for Plus limits (the app's own
// idea of "subscribed" is only for showing the UI). Set the same secret here (supabase secrets set
// REVENUECAT_WEBHOOK_SECRET=...) and as the "Authorization header value" in RevenueCat > Integrations > Webhooks.
// Writes use the service role, because subscriptions has no insert or update policy for signed-in users.

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const secret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");
  if (!secret) return fail("revenuecat-webhook", "not_configured", "REVENUECAT_WEBHOOK_SECRET is not set");
  if (!secretMatches(req.headers.get("Authorization"), secret)) return json({ error: "unauthorized" }, 401);

  let event: RevenueCatEvent;
  try {
    event = (await req.json()).event;
  } catch {
    return json({ error: "bad_request" }, 400);
  }
  const row = event ? toSubscriptionRow(event) : null;
  // Nothing to record (a test ping, an anonymous buyer): acknowledge so RevenueCat doesn't retry.
  if (!row) return json({ ignored: true });

  const { error } = await adminClient()
    .from("subscriptions")
    .upsert({ ...row, updated_at: new Date().toISOString() }, { onConflict: "source,external_id" });
  // 23503: the user was deleted, so there is no account left to attach this to. Retrying would never succeed.
  if (error && error.code !== "23503") return fail("revenuecat-webhook", "write_failed", error.message);
  return json({ ok: true });
});
