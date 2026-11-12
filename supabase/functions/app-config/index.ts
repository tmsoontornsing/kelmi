import { asCaller, json } from "../_shared/http.ts";

// GET or POST, Authorization: Bearer <the signed-in user's access token>
//
// Settings the app needs but should not carry inside the download. Today that is RevenueCat's public SDK key, which the
// purchases library has to be given. It is not a secret in the way a service key is (it only identifies the app to
// RevenueCat), but keeping it out of the app means it is not in the download, and only a signed-in person is handed it.
// Set REVENUECAT_IOS_KEY and REVENUECAT_ANDROID_KEY as secrets for the project; a platform with no key gets null.

Deno.serve(async (req) => {
  if (req.method !== "GET" && req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const caller = await asCaller(req);
  if (caller instanceof Response) return caller;

  return json({
    revenuecat: {
      ios: Deno.env.get("REVENUECAT_IOS_KEY") ?? null,
      android: Deno.env.get("REVENUECAT_ANDROID_KEY") ?? null,
    },
  });
});
