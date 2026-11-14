import { adminClient, asCaller, fail, json, readJson } from "../_shared/http.ts";
import { appleConfigFromEnv, revokeAppleToken } from "../_shared/apple.ts";
import { deleteRevenueCatCustomer } from "../_shared/revenuecat.ts";

// POST { confirm: "DELETE" }, Authorization: Bearer <the signed-in user's access token>
//
// Deleting is permanent, so a valid token alone is not enough: the body must say so explicitly, and the session must
// have signed in (password, OTP, Apple, Google...) within the last REAUTH_WINDOW_S. A session that is older answers 401
// { error: "reauth_required" } and the app asks the person to sign in again. A token that was only refreshed does not
// count as a sign-in: the time comes from the token's `amr` claim (when each sign-in method was used), not from `iat`,
// which every refresh renews.
//
// Deletes the caller's account. Their profile, plans, grocery lists, pantry and household links are removed
// with it, because every table references auth.users with on delete cascade. The waitlist is keyed by email, not by
// account, so the caller's row there (matched ignoring case) is deleted first, but only when the account's email is
// confirmed: otherwise someone could sign up with another person's address, never confirm it, and delete that
// person's waitlist entry. App stores require in-app
// account deletion for apps with sign-in. Uses the service role key Supabase provides to the function.
//
// Sign in with Apple: Apple requires apps to revoke the person's token when they delete their account. The apple-link
// function keeps the refresh token Apple issues at a native sign-in (public.apple_tokens); this function revokes it with
// Apple, using the APPLE_* secrets, just before deleting the account (the row goes with the account). Best effort: if
// Apple is down or the secrets are missing, the account is still deleted and the failure is logged. Accounts that signed in
// before apple-link existed, or through the browser, have no stored token; those people can remove Kelmi in their Apple ID
// settings (Sign in with Apple).

const REAUTH_WINDOW_S = 10 * 60;
const NOT_SIGN_IN = new Set(["token_refresh", "anonymous"]);

// The payload of a token GoTrue has just accepted (asCaller called getUser with it), so its claims can be read as-is.
function claimsOf(req: Request): Record<string, unknown> | null {
  const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
    const value = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    return value && typeof value === "object" ? value : null;
  } catch {
    return null;
  }
}

// When this session last signed in, in seconds since the epoch: the newest `amr` timestamp, else `auth_time`.
function lastSignInAt(claims: Record<string, unknown> | null): number | null {
  if (!claims) return null;
  // A refresh can add its own amr entry (method "token_refresh"); that is not a sign-in, and neither is an anonymous session.
  const times = Array.isArray(claims.amr)
    ? claims.amr
      .filter((m) => m && typeof m === "object" && !NOT_SIGN_IN.has(String((m as { method?: unknown }).method)))
      .map((m) => Number((m as { timestamp?: unknown }).timestamp))
      .filter(Number.isFinite)
    : [];
  if (times.length) return Math.max(...times);
  const authTime = Number(claims.auth_time);
  return Number.isFinite(authTime) ? authTime : null;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;

  const body = await readJson(req);
  if (body instanceof Response) return body;
  if (body?.confirm !== "DELETE") {
    return json({ error: "confirmation_required", message: "Confirm that you want to delete your account." }, 400);
  }

  const signedInAt = lastSignInAt(claimsOf(req));
  const now = Date.now() / 1000;
  if (signedInAt === null || now - signedInAt > REAUTH_WINDOW_S || signedInAt > now + 60) {
    return json({ error: "reauth_required", message: "For your security, sign in again, then delete your account." }, 401);
  }

  const admin = adminClient();
  const { data: found, error: readError } = await admin.auth.admin.getUserById(caller.userId);
  if (readError) return fail("delete-account", "user_read_failed", readError.message);

  // Before the account goes: if this fails the person can simply try again and nothing has been lost.
  const email = found.user?.email?.trim().toLowerCase();
  if (email && found.user?.email_confirmed_at) {
    const { error: waitlistError } = await admin.from("waitlist").delete().eq("email", email);
    if (waitlistError) return fail("delete-account", "waitlist_delete_failed", waitlistError.message);
  }

  // Apple first, while the stored token still exists. It never blocks the deletion: a person must always be able to delete.
  const { data: apple } = await admin.from("apple_tokens").select("refresh_token").eq("user_id", caller.userId).maybeSingle();
  if (apple?.refresh_token) {
    const cfg = appleConfigFromEnv();
    const revoked = cfg ? await revokeAppleToken(cfg, apple.refresh_token) : { result: "failed" as const, status: undefined };
    if (revoked.result !== "revoked") {
      console.error(JSON.stringify({ evt: "apple_revoke_failed", configured: Boolean(cfg), status: revoked.status ?? null, user_id: caller.userId }));
    }
  }

  const { error } = await admin.auth.admin.deleteUser(caller.userId);
  if (error) return fail("delete-account", "delete_failed", error.message);

  // Then RevenueCat's copy (the Privacy Policy promises it). Only after the account is gone, so a failed account delete
  // never leaves a live account without its subscription record. A failure here is logged for a manual follow-up in the
  // RevenueCat dashboard; the person's account is already deleted either way.
  const rc = await deleteRevenueCatCustomer(caller.userId, Deno.env.get("REVENUECAT_SECRET_KEY"));
  if (rc.result !== "deleted") {
    console.error(JSON.stringify({ evt: `revenuecat_delete_${rc.result}`, status: rc.status ?? null, user_id: caller.userId }));
  }
  return json({ deleted: true });
});
