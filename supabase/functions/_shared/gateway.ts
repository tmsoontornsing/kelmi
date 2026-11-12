// The rules for the gateway function (functions/gateway), kept free of Deno APIs so they can be tested on their own.
//
// The mobile app does not hold the Supabase anon key. It talks to the gateway, which forwards each request to the project
// with the key added here, on the server. The gateway is a plain pass-through, so row-level security still decides what any
// request can read or write. Only the services the app uses are forwarded, and only the Edge Functions it calls.

// Services the app uses. Realtime and Storage are left out on purpose: the app uses neither, and a function cannot proxy
// websockets.
const SERVICES = ["auth/v1", "rest/v1"] as const;

// Edge Functions reach the gateway as `fn/<name>`. A path with `functions/v1` in it twice (the gateway is itself at
// `/functions/v1/gateway`) is cut short by the platform before it reaches the function, so the app rewrites its calls.
const FUNCTIONS_PREFIX = "fn/";

// The Edge Functions the app calls. The gateway itself and the RevenueCat webhook (which RevenueCat calls directly, with
// its own secret) are not on the list.
export const ALLOWED_FUNCTIONS = ["generate-plan", "grocery-list", "meal-options", "delete-account", "app-config"] as const;

const METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"]);
export const MAX_BODY_BYTES = 1_500_000;

export type Route = { upstreamPath: string } | { error: "not_found" | "method_not_allowed" };

// `/gateway/rest/v1/profiles` or `/functions/v1/gateway/rest/v1/profiles` (the path depends on how the platform hands it
// over) becomes `/rest/v1/profiles` on the project, or an error.
export function routeFor(pathname: string, method: string): Route {
  if (!METHODS.has(method)) return { error: "method_not_allowed" };

  const marker = "/gateway/";
  const at = pathname.indexOf(marker);
  if (at < 0) return { error: "not_found" };
  const rest = pathname.slice(at + marker.length);

  // No way out of the allowed prefixes: no dot segments, backslashes, encoded slashes or dots, or empty segments.
  if (/(^|\/)\.\.?(\/|$)|\\|%2e|%2f|%5c|\/\//i.test(rest)) return { error: "not_found" };

  if (rest.startsWith(FUNCTIONS_PREFIX)) {
    const afterPrefix = rest.slice(FUNCTIONS_PREFIX.length);
    const name = afterPrefix.split("/")[0];
    if (!(ALLOWED_FUNCTIONS as readonly string[]).includes(name)) return { error: "not_found" };
    return { upstreamPath: `/functions/v1/${afterPrefix}` };
  }

  const service = SERVICES.find((s) => rest === s || rest.startsWith(`${s}/`));
  if (!service) return { error: "not_found" };
  if (service === "rest/v1" && blockedRestPath(rest.slice("rest/v1/".length))) return { error: "not_found" };
  return { upstreamPath: `/${rest}` };
}

// Database paths the app never uses and that must only be reached through the website's server route: the waitlist
// table and its sign-up function. Compared percent-decoded and case-insensitively and on the first segments only, so `waitlist/`, `Waitlist`
// or `rpc/join_waitlist/x` are refused too. The database grants are the real control (anon has no insert on waitlist and
// no execute on join_waitlist, 20261116000200_waitlist_hardening.sql); this keeps the gateway from being an open relay to them.
const BLOCKED_REST = [["waitlist"], ["rpc", "join_waitlist"], ["rpc", "waitlist_throttle"]];
function blockedRestPath(afterRest: string): boolean {
  // Decoded first, so `%57aitlist` or `join_%77aitlist` (which PostgREST would decode) are caught; undecodable is refused.
  let segs: string[];
  try {
    segs = afterRest.split("/").map((seg) => decodeURIComponent(seg).toLowerCase());
  } catch {
    return true;
  }
  return BLOCKED_REST.some((b) => b.every((part, i) => segs[i] === part));
}

// Content-Length must be a plain decimal number if it is sent at all. Returns the number, null when absent, or "invalid".
export function declaredLength(headers: Headers): number | null | "invalid" {
  const raw = headers.get("content-length");
  if (raw === null) return null;
  const v = raw.trim();
  if (!/^\d{1,15}$/.test(v)) return "invalid";
  return Number(v);
}

// Reads a body stream while counting bytes and stops (cancelling the stream) as soon as it passes `max`, so a chunked or
// mislabelled body is never buffered past the cap. Returns null when it is too large.
export async function readCapped(stream: ReadableStream<Uint8Array> | null, max: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.byteLength;
  }
  return out;
}

// Per-address request limit, kept in this instance's memory. Best effort: each instance counts on its own and the counts
// reset on a cold start, so it slows a single noisy client rather than being a hard boundary (the project's own limits
// still apply behind it).
export const RATE_LIMIT_PER_MINUTE = 120;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_KEYS = 10_000;
export function makeRateLimiter(limit = RATE_LIMIT_PER_MINUTE, windowMs = RATE_WINDOW_MS) {
  const hits = new Map<string, { n: number; reset: number }>();
  return (key: string, now = Date.now()): boolean => {
    if (hits.size >= RATE_MAX_KEYS) {
      for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
      if (hits.size >= RATE_MAX_KEYS) hits.clear();
    }
    const h = hits.get(key);
    if (!h || h.reset <= now) {
      hits.set(key, { n: 1, reset: now + windowMs });
      return false;
    }
    h.n += 1;
    return h.n > limit;
  };
}

// A signed-in session token is a JWT: three base64url parts. The app sends a placeholder instead when nobody is signed in.
export const looksLikeJwt = (token: string) => /^[\w-]+\.[\w-]+\.[\w-]*$/.test(token);

// Request headers that are passed on. Everything else (cookies, proxy and routing hints such as x-original-url,
// x-http-method-override or x-envoy-*, address headers such as x-client-ip or true-client-ip, the caller's own apikey)
// is dropped: an allow-list, so a header nobody thought of cannot reach the project. apikey, authorization,
// x-forwarded-for and accept-encoding are set below by the gateway itself.
const ALLOW_REQUEST = new Set([
  "content-type",
  "accept",
  "accept-profile",
  "content-profile",
  "prefer",
  "range",
  "x-client-info",
  "x-supabase-api-version",
]);

export function upstreamHeaders(incoming: Headers, anonKey: string, clientIp: string | null): Headers {
  const out = new Headers();
  incoming.forEach((value, name) => {
    if (ALLOW_REQUEST.has(name.toLowerCase())) out.set(name, value);
  });
  out.set("apikey", anonKey);

  // Their own session token goes through untouched. Anything else (no one signed in) gets the anon key as its bearer, which
  // is what supabase-js would have sent had it held the key itself.
  const bearer = incoming.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  out.set("authorization", `Bearer ${looksLikeJwt(bearer) ? bearer : anonKey}`);

  // Rate limits and logs at the project should see the person's address, not the gateway's.
  if (clientIp) out.set("x-forwarded-for", clientIp);
  out.set("accept-encoding", "identity");
  return out;
}

const DROP_RESPONSE = new Set(["connection", "keep-alive", "transfer-encoding", "content-encoding", "content-length"]);

export function downstreamHeaders(upstream: Headers): Headers {
  const out = new Headers();
  upstream.forEach((value, name) => {
    if (!DROP_RESPONSE.has(name.toLowerCase())) out.append(name, value);
  });
  return out;
}

// The person's address as the platform reports it, for forwarding and the rate limit. The platform's own single-value
// headers come first. X-Forwarded-For is a list the caller can start with anything they like (proxies append to it), so
// only its last entry, the one added by the hop in front of this function, is used.
export function clientIpOf(headers: Headers): string | null {
  const platform = headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim();
  if (platform) return platform;
  const entries = (headers.get("x-forwarded-for") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  return entries.at(-1) ?? null;
}
