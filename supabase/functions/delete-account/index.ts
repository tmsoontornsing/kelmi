import { adminClient, asCaller, fail, json, readJson } from "../_shared/http.ts";

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
// Sign in with Apple: Apple asks apps to revoke the user's token when they delete their account. That needs the user's
// Apple refresh token (or authorization code) and a client secret signed with the app's Apple private key. Supabase
// does not keep Apple's refresh token for a native sign-in (signInWithIdToken), and this function has no Apple key, so
// it cannot be done here. It has to be done by the app at sign-in time (store the authorization code with the server)
// plus an APPLE_PRIVATE_KEY secret, or by hand in Apple's developer account. Left undone on purpose.

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

  const { error } = await admin.auth.admin.deleteUser(caller.userId);
  if (error) return fail("delete-account", "delete_failed", error.message);
  return json({ deleted: true });
});
