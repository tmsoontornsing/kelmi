import { json } from "../_shared/http.ts";
import {
  clientIpOf,
  declaredLength,
  downstreamHeaders,
  makeRateLimiter,
  MAX_BODY_BYTES,
  readCapped,
  routeFor,
  upstreamHeaders,
} from "../_shared/gateway.ts";

// The app's only door to the project. The app no longer ships the Supabase anon key: it sends its requests here (with a
// placeholder where the key would go), and this function forwards them to Auth, the database API or an allowed Edge Function
// with the real key added. See _shared/gateway.ts for what is let through.
//
// This does not make the data any more private than row-level security already does: whatever the anon key could do, a
// request through here can do. What it changes is that the key is not inside the app, so it cannot be lifted from the
// download, and the project's address is the only thing the app has to know.
//
// Deployed without the platform's JWT check (config.toml), because the app has no key to send. Requests are checked at the
// project itself, exactly as if they had gone there directly.

const UPSTREAM_TIMEOUT_MS = 140_000;
const limited = makeRateLimiter();

Deno.serve(async (req) => {
  const base = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!base || !anonKey) {
    console.error("gateway: missing SUPABASE_URL or the anon key");
    return json({ error: "server_misconfigured" }, 500);
  }

  // Counted before routing, so probing for paths costs the same as real requests. With no address at all (the platform
  // always sets one) nothing is counted, rather than putting every such request in one shared bucket.
  const clientIp = clientIpOf(req.headers);
  if (clientIp && limited(clientIp)) return json({ error: "rate_limited" }, 429);

  const url = new URL(req.url);
  const route = routeFor(url.pathname, req.method);
  if ("error" in route) return json({ error: route.error }, route.error === "method_not_allowed" ? 405 : 404);

  const declared = declaredLength(req.headers);
  if (declared === "invalid") return json({ error: "bad_request" }, 400);
  if (declared !== null && declared > MAX_BODY_BYTES) return json({ error: "payload_too_large" }, 413);

  // Read with a running count, so a chunked or mislabelled body is cut off at the cap instead of buffered whole.
  const hasBody = req.method !== "GET" && req.method !== "HEAD";
  const body = hasBody ? await readCapped(req.body, MAX_BODY_BYTES).catch(() => null) : undefined;
  if (body === null) return json({ error: "payload_too_large" }, 413);

  const target = new URL(route.upstreamPath, base);
  target.search = url.search;

  try {
    const upstream = await fetch(target, {
      method: req.method,
      headers: upstreamHeaders(req.headers, anonKey, clientIp),
      body,
      // Sign-in redirects (to Google and back) belong to the app's browser, not to this function.
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    return new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: downstreamHeaders(upstream.headers),
    });
  } catch (e) {
    console.error(`gateway: ${req.method} ${route.upstreamPath}: ${(e as Error).message}`);
    return json({ error: "bad_gateway" }, 502);
  }
});
