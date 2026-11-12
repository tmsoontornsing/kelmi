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
  return { upstreamPath: `/${rest}` };
}

// A signed-in session token is a JWT: three base64url parts. The app sends a placeholder instead when nobody is signed in.
export const looksLikeJwt = (token: string) => /^[\w-]+\.[\w-]+\.[\w-]*$/.test(token);

// Request headers that are never passed on: the connection's own, the caller's key and address headers (set again below),
// and anything that would make the body look different from what is actually sent.
const DROP_REQUEST = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "upgrade",
  "content-length",
  "accept-encoding",
  "apikey",
  "authorization",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "forwarded",
]);

export function upstreamHeaders(incoming: Headers, anonKey: string, clientIp: string | null): Headers {
  const out = new Headers();
  incoming.forEach((value, name) => {
    const lower = name.toLowerCase();
    if (DROP_REQUEST.has(lower) || lower.startsWith("cf-") || lower.startsWith("x-vercel-") || lower.startsWith("sb-")) return;
    out.set(name, value);
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

// The person's address as the platform reports it, for forwarding.
export function clientIpOf(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("cf-connecting-ip") || headers.get("x-real-ip") || null;
}
