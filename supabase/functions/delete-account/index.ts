import { adminClient, asCaller, fail, json } from "../_shared/http.ts";

// POST, Authorization: Bearer <the signed-in user's access token>
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;

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
