// Sign in with Apple: the two server calls Apple requires for an app that lets people delete their account (App Store
// Review Guideline 5.1.1(v)). At sign-in the app hands over Apple's one-time authorization code; we swap it for a refresh
// token and keep it. When the person deletes their account we tell Apple to revoke that token, so Kelmi disappears from
// the "Sign in with Apple" list in their Apple ID settings. Pure helpers with an injectable fetch, so they can be tested.
// Apple docs: https://developer.apple.com/documentation/sign_in_with_apple/generate_and_validate_tokens
//             https://developer.apple.com/documentation/sign_in_with_apple/revoke_tokens

export type AppleConfig = {
  teamId: string;
  keyId: string;
  // The app's bundle identifier for a native sign-in (the Services ID is only for web sign-in).
  clientId: string;
  // The contents of the AuthKey_XXXX.p8 file from the Apple developer account (a PKCS#8 PEM).
  privateKey: string;
};

const APPLE = "https://appleid.apple.com";
const DEFAULT_CLIENT_ID = "com.logicbaker.kelmi";

// Reads the settings from Edge Function secrets. Null when any is missing, which turns the whole feature off (sign-in and
// account deletion carry on without it).
export function appleConfigFromEnv(get: (k: string) => string | undefined = (k) => Deno.env.get(k)): AppleConfig | null {
  const teamId = get("APPLE_TEAM_ID");
  const keyId = get("APPLE_KEY_ID");
  const privateKey = get("APPLE_PRIVATE_KEY");
  if (!teamId || !keyId || !privateKey) return null;
  // A secret pasted on one line has its newlines as the two characters "\n".
  return { teamId, keyId, privateKey: privateKey.replace(/\\n/g, "\n"), clientId: get("APPLE_CLIENT_ID") || DEFAULT_CLIENT_ID };
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlText = (value: unknown) => b64url(new TextEncoder().encode(JSON.stringify(value)));

// The "client secret" Apple wants is a short-lived JWT signed (ES256) with the developer key. Valid for 5 minutes.
export async function appleClientSecret(cfg: AppleConfig, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
  const pem = cfg.privateKey.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, "").replace(/\s+/g, "");
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (c) => c.charCodeAt(0)),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const head = b64urlText({ alg: "ES256", kid: cfg.keyId, typ: "JWT" });
  const body = b64urlText({ iss: cfg.teamId, iat: nowSeconds, exp: nowSeconds + 300, aud: APPLE, sub: cfg.clientId });
  // WebCrypto returns the signature as r||s, which is the format a JWT needs.
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(`${head}.${body}`)));
  return `${head}.${body}.${b64url(sig)}`;
}

// The Apple user id ("sub") inside an ID token we received straight from Apple over TLS. Not a signature check: the token
// was never handled by the app, so it has not passed through anyone who could change it.
export function appleSubOf(idToken: unknown): string | null {
  if (typeof idToken !== "string") return null;
  try {
    const part = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const sub = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(part.padEnd(Math.ceil(part.length / 4) * 4, "=")), (c) => c.charCodeAt(0)))).sub;
    return typeof sub === "string" && sub ? sub : null;
  } catch {
    return null;
  }
}

const form = (fields: Record<string, string>) => ({
  method: "POST",
  headers: { "content-type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
  signal: AbortSignal.timeout(8000),
});

// Swaps the one-time authorization code from sign-in for the person's refresh token and Apple user id. The code works
// once, for about five minutes. Null for any failure (a used or expired code, a wrong key, Apple being down).
export async function exchangeAppleCode(
  cfg: AppleConfig,
  code: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ refreshToken: string; sub: string | null } | null> {
  try {
    const res = await fetchImpl(`${APPLE}/auth/token`, form({
      client_id: cfg.clientId,
      client_secret: await appleClientSecret(cfg),
      code,
      grant_type: "authorization_code",
    }));
    if (!res.ok) {
      await res.body?.cancel();
      return null;
    }
    const data = await res.json();
    if (typeof data?.refresh_token !== "string" || !data.refresh_token) return null;
    return { refreshToken: data.refresh_token, sub: appleSubOf(data.id_token) };
  } catch {
    return null;
  }
}

// Tells Apple to disconnect Kelmi from the person's Apple ID. "invalid_grant" means the token is already revoked or gone,
// which is the result we wanted, so it counts as done. Never throws.
export async function revokeAppleToken(
  cfg: AppleConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ result: "revoked" | "failed"; status?: number }> {
  try {
    const res = await fetchImpl(`${APPLE}/auth/revoke`, form({
      client_id: cfg.clientId,
      client_secret: await appleClientSecret(cfg),
      token: refreshToken,
      token_type_hint: "refresh_token",
    }));
    if (res.ok) {
      await res.body?.cancel();
      return { result: "revoked", status: res.status };
    }
    const text = await res.text().catch(() => "");
    return { result: res.status === 400 && text.includes("invalid_grant") ? "revoked" : "failed", status: res.status };
  } catch {
    return { result: "failed" };
  }
}
