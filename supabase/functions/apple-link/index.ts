import { adminClient, asCaller, fail, json, rateLimited, readJson } from "../_shared/http.ts";
import { appleConfigFromEnv, exchangeAppleCode } from "../_shared/apple.ts";

// POST { code }, Authorization: Bearer <the signed-in user's access token>
//
// Called by the app right after a native Sign in with Apple. `code` is Apple's one-time authorization code. It is swapped
// for a refresh token, which is kept (public.apple_tokens, service role only) so delete-account can revoke it later, as
// Apple requires. Needs the secrets APPLE_TEAM_ID, APPLE_KEY_ID and APPLE_PRIVATE_KEY (and APPLE_CLIENT_ID if the bundle
// id is not com.logicbaker.kelmi). Without them this answers { linked: false } and sign-in carries on as before. The app
// ignores every failure here: signing in never waits on it.

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;
  const limited = await rateLimited(caller.userId, "apple-link", 10, 60);
  if (limited) return limited;

  const body = await readJson(req);
  if (body instanceof Response) return body;
  const code = body?.code;
  if (typeof code !== "string" || code.length < 1 || code.length > 2000) return json({ error: "bad_request" }, 400);

  const cfg = appleConfigFromEnv();
  if (!cfg) return json({ linked: false, reason: "not_configured" });

  const admin = adminClient();
  const { data: found, error: readError } = await admin.auth.admin.getUserById(caller.userId);
  if (readError) return fail("apple-link", "user_read_failed", readError.message);
  // Only an account that really signed in with Apple. The code was issued to this app for one Apple account; the id inside
  // Apple's answer must be the Apple identity on this Kelmi account, so a token can never be filed under someone else.
  const identity = found.user?.identities?.find((i) => i.provider === "apple");
  if (!identity) return json({ linked: false, reason: "no_apple_identity" });

  const exchanged = await exchangeAppleCode(cfg, code);
  if (!exchanged) return json({ linked: false, reason: "exchange_failed" });
  // Fails closed: with no Apple user id on either side, nothing is stored. (identity.id is the identity row's own uuid, not
  // Apple's id, so it is never used here.)
  const identitySub = (identity.identity_data as { sub?: string } | undefined)?.sub ?? (identity as { provider_id?: string }).provider_id;
  if (!exchanged.sub || !identitySub || exchanged.sub !== identitySub) return json({ linked: false, reason: "mismatch" });

  const { error } = await admin.from("apple_tokens").upsert({ user_id: caller.userId, refresh_token: exchanged.refreshToken });
  if (error) return fail("apple-link", "store_failed", error.message);
  return json({ linked: true });
});
