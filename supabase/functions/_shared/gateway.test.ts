import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { ALLOWED_FUNCTIONS, clientIpOf, downstreamHeaders, looksLikeJwt, routeFor, upstreamHeaders } from "./gateway.ts";

const ANON = "anon.key.value";
const SESSION = "aaa.bbb.ccc";

Deno.test("the services the app uses are forwarded, with the gateway prefix removed", () => {
  assertEquals(routeFor("/gateway/rest/v1/profiles", "GET"), { upstreamPath: "/rest/v1/profiles" });
  assertEquals(routeFor("/functions/v1/gateway/rest/v1/rpc/user_is_plus", "POST"), { upstreamPath: "/rest/v1/rpc/user_is_plus" });
  assertEquals(routeFor("/gateway/auth/v1/token", "POST"), { upstreamPath: "/auth/v1/token" });
  assertEquals(routeFor("/gateway/auth/v1/authorize", "GET"), { upstreamPath: "/auth/v1/authorize" });
});

Deno.test("only the Edge Functions the app calls are forwarded", () => {
  for (const name of ALLOWED_FUNCTIONS) {
    assertEquals(routeFor(`/gateway/fn/${name}`, "POST"), { upstreamPath: `/functions/v1/${name}` });
  }
  // Not the gateway itself (a loop), not the webhook (RevenueCat calls that directly), not a made-up name.
  assertEquals(routeFor("/gateway/fn/gateway", "POST"), { error: "not_found" });
  assertEquals(routeFor("/gateway/fn/revenuecat-webhook", "POST"), { error: "not_found" });
  assertEquals(routeFor("/gateway/fn/anything-else", "POST"), { error: "not_found" });
  // The long form is no longer accepted: the platform cuts it short, so it could only ever be a mistake.
  assertEquals(routeFor("/gateway/functions/v1/generate-plan", "POST"), { error: "not_found" });
});

Deno.test("services the app does not use are refused", () => {
  assertEquals(routeFor("/gateway/storage/v1/object/x", "GET"), { error: "not_found" });
  assertEquals(routeFor("/gateway/realtime/v1/websocket", "GET"), { error: "not_found" });
  assertEquals(routeFor("/gateway/graphql/v1", "POST"), { error: "not_found" });
  assertEquals(routeFor("/gateway/", "GET"), { error: "not_found" });
  assertEquals(routeFor("/elsewhere/rest/v1/profiles", "GET"), { error: "not_found" });
});

Deno.test("paths cannot climb out of the allowed prefixes", () => {
  for (const bad of [
    "/gateway/rest/v1/../../storage/v1/x",
    "/gateway/rest/v1/%2e%2e/storage",
    "/gateway/rest/v1/..%2fstorage",
    "/gateway/rest/v1//profiles",
    "/gateway/rest/v1\\profiles",
    "/gateway/fn/generate-plan/../gateway",
  ]) {
    assertEquals(routeFor(bad, "GET"), { error: "not_found" }, bad);
  }
});

Deno.test("odd methods are refused", () => {
  assertEquals(routeFor("/gateway/rest/v1/profiles", "TRACE"), { error: "method_not_allowed" });
  assertEquals(routeFor("/gateway/rest/v1/profiles", "CONNECT"), { error: "method_not_allowed" });
});

Deno.test("a signed-in session token passes through, and the anon key is added as the key", () => {
  const out = upstreamHeaders(new Headers({ authorization: `Bearer ${SESSION}`, apikey: "client-sent", "content-type": "application/json" }), ANON, "1.2.3.4");
  assertEquals(out.get("apikey"), ANON);
  assertEquals(out.get("authorization"), `Bearer ${SESSION}`);
  assertEquals(out.get("content-type"), "application/json");
});

Deno.test("with no one signed in, the placeholder is replaced by the anon key", () => {
  const placeholder = upstreamHeaders(new Headers({ authorization: "Bearer kelmi-gateway", apikey: "kelmi-gateway" }), ANON, null);
  assertEquals(placeholder.get("authorization"), `Bearer ${ANON}`);
  assertEquals(placeholder.get("apikey"), ANON);
  const none = upstreamHeaders(new Headers(), ANON, null);
  assertEquals(none.get("authorization"), `Bearer ${ANON}`);
});

Deno.test("hop-by-hop and spoofable headers are not passed on, and the person's address is", () => {
  const out = upstreamHeaders(
    new Headers({
      host: "gateway.example",
      connection: "keep-alive",
      "content-length": "10",
      "accept-encoding": "gzip",
      "x-forwarded-for": "9.9.9.9",
      "cf-connecting-ip": "8.8.8.8",
      "x-client-info": "supabase-js-react-native/2",
      prefer: "return=representation",
    }),
    ANON,
    "1.2.3.4",
  );
  assertEquals(out.get("host"), null);
  assertEquals(out.get("connection"), null);
  assertEquals(out.get("content-length"), null);
  assertEquals(out.get("cf-connecting-ip"), null);
  assertEquals(out.get("accept-encoding"), "identity");
  assertEquals(out.get("x-forwarded-for"), "1.2.3.4");
  assertEquals(out.get("x-client-info"), "supabase-js-react-native/2");
  assertEquals(out.get("prefer"), "return=representation");
});

Deno.test("the caller's address comes from the first forwarded entry", () => {
  assertEquals(clientIpOf(new Headers({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" })), "1.1.1.1");
  assertEquals(clientIpOf(new Headers({ "cf-connecting-ip": "3.3.3.3" })), "3.3.3.3");
  assertEquals(clientIpOf(new Headers()), null);
});

Deno.test("what looks like a JWT is told from a placeholder", () => {
  assertEquals(looksLikeJwt("aaa.bbb.ccc"), true);
  assertEquals(looksLikeJwt("eyJhbGciOi.eyJzdWIiOiIx.sig-_x"), true);
  assertEquals(looksLikeJwt("kelmi-gateway"), false);
  assertEquals(looksLikeJwt(""), false);
});

Deno.test("response headers drop what no longer matches the forwarded body", () => {
  const out = downstreamHeaders(new Headers({ "content-type": "application/json", "content-encoding": "gzip", "content-length": "99", "x-custom": "1" }));
  assertEquals(out.get("content-encoding"), null);
  assertEquals(out.get("content-length"), null);
  assertEquals(out.get("content-type"), "application/json");
  assertNotEquals(out.get("x-custom"), null);
});
