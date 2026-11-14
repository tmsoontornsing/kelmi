import { assert, assertEquals } from "jsr:@std/assert@1";
import { appleClientSecret, appleConfigFromEnv, appleSubOf, exchangeAppleCode, revokeAppleToken, type AppleConfig } from "./apple.ts";

// A throwaway P-256 key, in the same PKCS#8 PEM form as Apple's .p8 file.
const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8)).match(/.{1,64}/g)!.join("\n")}\n-----END PRIVATE KEY-----`;
const cfg: AppleConfig = { teamId: "TEAM123456", keyId: "KEY1234567", clientId: "com.example.app", privateKey: pem };

const decode = (s: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0))));
const jwtWith = (payload: unknown) => `x.${btoa(JSON.stringify(payload)).replace(/=+$/, "")}.y`;

Deno.test("the client secret is an ES256 JWT with Apple's claims and a valid signature", async () => {
  const jwt = await appleClientSecret(cfg, 1_700_000_000);
  const [h, p, s] = jwt.split(".");
  assertEquals(decode(h), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assertEquals(decode(p), { iss: "TEAM123456", iat: 1_700_000_000, exp: 1_700_000_300, aud: "https://appleid.apple.com", sub: "com.example.app" });
  const sig = Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=")), (c) => c.charCodeAt(0));
  assertEquals(sig.length, 64);
  assert(await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, pair.publicKey, sig, new TextEncoder().encode(`${h}.${p}`)));
});

Deno.test("settings come from secrets; a missing one turns the feature off; a one-line key gets its newlines back", () => {
  const env = (o: Record<string, string>) => (k: string) => o[k];
  assertEquals(appleConfigFromEnv(env({})), null);
  assertEquals(appleConfigFromEnv(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K" })), null);
  const got = appleConfigFromEnv(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "a\\nb" }));
  assertEquals(got, { teamId: "T", keyId: "K", privateKey: "a\nb", clientId: "com.logicbaker.kelmi" });
  assertEquals(appleConfigFromEnv(env({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_PRIVATE_KEY: "k", APPLE_CLIENT_ID: "x.y" }))?.clientId, "x.y");
});

Deno.test("the Apple user id is read from the ID token, and bad input gives null", () => {
  assertEquals(appleSubOf(jwtWith({ sub: "001234.abc" })), "001234.abc");
  assertEquals(appleSubOf(jwtWith({ sub: "" })), null);
  assertEquals(appleSubOf("nonsense"), null);
  assertEquals(appleSubOf(undefined), null);
});

Deno.test("exchanging a code posts the grant to Apple and returns the refresh token and user id", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fake = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify({ refresh_token: "r_token", id_token: jwtWith({ sub: "u1" }) }), { status: 200 }));
  }) as typeof fetch;
  assertEquals(await exchangeAppleCode(cfg, "the-code", fake), { refreshToken: "r_token", sub: "u1" });
  assertEquals(calls[0].url, "https://appleid.apple.com/auth/token");
  const sent = new URLSearchParams(calls[0].init?.body as string);
  assertEquals(sent.get("grant_type"), "authorization_code");
  assertEquals(sent.get("code"), "the-code");
  assertEquals(sent.get("client_id"), "com.example.app");
  assert(sent.get("client_secret")!.split(".").length === 3);
});

Deno.test("exchanging a code: Apple errors, a missing token and network failures all give null", async () => {
  const reply = (status: number, body: unknown) => (() => Promise.resolve(new Response(JSON.stringify(body), { status }))) as unknown as typeof fetch;
  assertEquals(await exchangeAppleCode(cfg, "c", reply(400, { error: "invalid_grant" })), null);
  assertEquals(await exchangeAppleCode(cfg, "c", reply(200, { id_token: "x" })), null);
  assertEquals(await exchangeAppleCode(cfg, "c", (() => Promise.reject(new Error("down"))) as unknown as typeof fetch), null);
});

Deno.test("revoking posts the refresh token; invalid_grant counts as already revoked; other errors fail without throwing", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const ok = ((url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(null, { status: 200 }));
  }) as typeof fetch;
  assertEquals(await revokeAppleToken(cfg, "r_token", ok), { result: "revoked", status: 200 });
  assertEquals(calls[0].url, "https://appleid.apple.com/auth/revoke");
  const sent = new URLSearchParams(calls[0].init?.body as string);
  assertEquals(sent.get("token"), "r_token");
  assertEquals(sent.get("token_type_hint"), "refresh_token");

  const reply = (status: number, body: string) => (() => Promise.resolve(new Response(body, { status }))) as unknown as typeof fetch;
  assertEquals((await revokeAppleToken(cfg, "r", reply(400, '{"error":"invalid_grant"}'))).result, "revoked");
  assertEquals(await revokeAppleToken(cfg, "r", reply(401, '{"error":"invalid_client"}')), { result: "failed", status: 401 });
  assertEquals(await revokeAppleToken(cfg, "r", (() => Promise.reject(new Error("down"))) as unknown as typeof fetch), { result: "failed" });
});
