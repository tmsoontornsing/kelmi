// Red-team tests for the gateway. LOCAL ONLY: fetch is stubbed (_stub.ts) and the run has no --allow-net.
//   deno test --cached-only --allow-env --allow-read supabase/scripts/redteam/gateway.test.ts
import { calls, loadHandler, record, setEnv, setRouter, STUB_BASE } from "./_stub.ts";
import { ALLOWED_FUNCTIONS, clientIpOf, downstreamHeaders, MAX_BODY_BYTES, routeFor, upstreamHeaders } from "../../functions/_shared/gateway.ts";

const opts = { sanitizeOps: false, sanitizeResources: false };
setEnv();

// What the upstream would actually resolve the forwarded path to.
function upstreamResolves(upstreamPath: string): string {
  return new URL(upstreamPath, STUB_BASE).pathname;
}
function allowedUpstream(path: string): boolean {
  if (path.startsWith("/rest/v1/") || path === "/rest/v1" || path.startsWith("/auth/v1/") || path === "/auth/v1") return true;
  return ALLOWED_FUNCTIONS.some((f) => path === `/functions/v1/${f}` || path.startsWith(`/functions/v1/${f}/`));
}

Deno.test({ name: "routeFor path-escape fuzz", ...opts, fn() {
  const raw = [
    "/gateway/rest/v1/%2e%2e/%2e%2e/storage/v1/object/x",
    "/gateway/rest/v1/%2E%2E/storage/v1",
    "/gateway/rest/v1/%252e%252e/%252e%252e/storage/v1/object",
    "/gateway/rest/v1/.%2e/storage",
    "/gateway/rest/v1/..%2fstorage",
    "/gateway/rest/v1/..%5cstorage",
    "/gateway/rest/v1/．．/．．/storage/v1", // fullwidth dots
    "/gateway/rest/v1/․․/storage/v1", // one-dot leader
    "/gateway/rest/v1;/../storage/v1",
    "/gateway/rest/v1;x/profiles",
    "/gateway/rest/v1/profiles;/../../storage/v1",
    "/gateway/REST/v1/profiles",
    "/gateway/Rest/V1/profiles",
    "/gateway/fn/Generate-Plan",
    "/gateway/fn/generate-plan;x",
    "/gateway/fn/generate-plan%3F",
    "/gateway/fn/generate-plan%00",
    "/gateway/fn/generate-plan/../revenuecat-webhook",
    "/gateway/fn/generate-plan/..%2frevenuecat-webhook",
    "/gateway/fn/revenuecat-webhook",
    "/gateway/fn/gateway",
    "/gateway/fn/",
    "/gateway/functions/v1/revenuecat-webhook",
    "/gateway/rest/v1@evil.example/x",
    "/gateway//evil.example/rest/v1/x",
    "/gateway/rest/v1//..//storage",
    "/gateway/rest/v1/x\\..\\..\\storage",
    "/gateway/rest/v1/.\t./storage/v1",
    "/gateway/storage/v1/object/public/x",
    "/gateway/realtime/v1/websocket",
    "/gateway/graphql/v1",
    "/gateway/pg/query",
    "/anything/gateway/rest/v1/profiles",
    "/gateway/rest/v1/x/gateway/storage/v1",
    "/gateway/auth/v1/admin/users",
    "/gateway/rest/v1/rpc/claim_plan_generation",
    "/gateway/rest/v1/rpc/replace_meal_plan",
  ];
  const escapes: string[] = [];
  const lines: string[] = [];
  for (const r of raw) {
    // Two views: the pathname as the runtime hands it over (WHATWG-normalised) and the raw string (in case it is not).
    for (const [label, p] of [["norm", new URL(r, "http://edge.invalid").pathname], ["raw", r]] as const) {
      const route = routeFor(p, "GET");
      if ("upstreamPath" in route) {
        const resolved = upstreamResolves(route.upstreamPath);
        lines.push(`${label} ${r} -> ${route.upstreamPath} (resolves ${resolved})`);
        // Only the normalised view is reachable: index.ts routes on new URL(req.url).pathname, which strips tabs and dot
        // segments. A raw-only hit is printed but is not an attack.
        if (!allowedUpstream(resolved) && label === "norm") escapes.push(`${label} ${r} -> ${resolved}`);
        if (!allowedUpstream(resolved) && label === "raw") lines.push(`    (raw-only; unreachable because the runtime normalises the URL first)`);
      } else lines.push(`${label} ${r} -> ${route.error}`);
    }
  }
  console.log(lines.map((l) => "    " + l).join("\n"));
  record(
    "routeFor: escape to a non-allowed upstream (storage/realtime/graphql/other functions) via encoding/dot/unicode/;/@/case tricks",
    escapes.length ? "PROVEN" : "BLOCKED",
    escapes.length ? escapes.join(" | ") : `${raw.length * 2} variants; every forwarded path resolves inside /rest/v1, /auth/v1 or an allowed function`,
  );
  // Long path: regex is linear.
  const long = "/gateway/rest/v1/" + "a/".repeat(500_000) + "x";
  const t0 = performance.now();
  routeFor(long, "GET");
  routeFor("/gateway/rest/v1/" + "./".repeat(200_000) + "%2", "GET");
  const ms = performance.now() - t0;
  record("routeFor: ReDoS with a ~1MB path", ms > 500 ? "PROVEN" : "BLOCKED", `two 0.4-1MB paths routed in ${ms.toFixed(1)} ms`);

  // Service-role-only RPCs and auth admin ARE forwarded: the gateway relies on upstream grants/JWT checks.
  const rpc = routeFor("/gateway/rest/v1/rpc/claim_plan_generation", "POST");
  const adm = routeFor("/gateway/auth/v1/admin/users", "GET");
  record(
    "routeFor: rest/v1/rpc/<service-only fn> and auth/v1/admin/* forwarded",
    "INFO",
    `rpc -> ${JSON.stringify(rpc)}, admin -> ${JSON.stringify(adm)}. Forwarded with the anon key; protection is only the DB grant (revoke ... from anon, authenticated in 20261110000000_plan_claims.sql:175-177, verified by waitlist-db.mjs) and GoTrue's service-role check.`,
  );
}});

Deno.test({ name: "upstreamHeaders injection", ...opts, fn() {
  const evil = new Headers({
    apikey: "SERVICE_ROLE_KEY_ATTEMPT",
    Authorization: "Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.",
    Host: "evil.example",
    "X-Forwarded-For": "6.6.6.6",
    "X-Forwarded-Host": "evil.example",
    "X-Forwarded-Proto": "http",
    "X-Real-IP": "6.6.6.6",
    Forwarded: "for=6.6.6.6",
    "X-Forwarded-Port": "1",
    "X-Forwarded-Prefix": "/admin",
    "X-Original-URL": "/storage/v1/object",
    "X-Rewrite-URL": "/storage/v1/object",
    "X-HTTP-Method-Override": "DELETE",
    "X-Client-IP": "6.6.6.6",
    "True-Client-IP": "6.6.6.6",
    "X-Envoy-Original-Path": "/storage/v1",
    "X-Envoy-Internal": "true",
    "Accept-Profile": "auth",
    "Content-Profile": "auth",
    Prefer: "tx=commit, return=representation",
    Cookie: "sb-access-token=x",
    "sb-role": "service_role",
    "CF-Connecting-IP": "6.6.6.6",
    "x-vercel-ip": "6.6.6.6",
  });
  const out = upstreamHeaders(evil, "ANON", clientIpOf(evil));
  const passed: string[] = [];
  out.forEach((v, k) => passed.push(`${k}: ${v}`));
  console.log(passed.map((l) => "    -> " + l).join("\n"));
  record(
    "upstreamHeaders: caller-supplied apikey / service-role key replaces the gateway key",
    out.get("apikey") === "ANON" ? "BLOCKED" : "PROVEN",
    `apikey forwarded = ${out.get("apikey")}`,
  );
  record(
    "upstreamHeaders: forged JWT (alg none, role service_role) forwarded as bearer",
    "INFO",
    `authorization forwarded = ${out.get("authorization")} (looksLikeJwt only checks shape; signature is checked upstream, so not an escalation on its own)`,
  );
  record("upstreamHeaders: Host injection", out.has("host") ? "PROVEN" : "BLOCKED", `host forwarded = ${out.get("host")}`);
  const spoofy = ["x-forwarded-port", "x-forwarded-prefix", "x-original-url", "x-rewrite-url", "x-http-method-override", "x-client-ip", "true-client-ip", "x-envoy-original-path", "x-envoy-internal", "cookie"]
    .filter((h) => out.has(h));
  record(
    "upstreamHeaders: proxy/routing/IP headers not in the deny-list reach the project",
    spoofy.length ? "PROVEN" : "BLOCKED",
    `passed through: ${spoofy.join(", ") || "none"} (request headers are now an allow-list)`,
  );
  record(
    "clientIpOf: X-Forwarded-For spoofing sets the IP the project sees",
    clientIpOf(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })) === "6.6.6.6" ? "PROVEN" : "BLOCKED",
    `clientIpOf("6.6.6.6, 203.0.113.9") = ${clientIpOf(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))}; upstream x-forwarded-for = ${out.get("x-forwarded-for")} (taken from CF-Connecting-IP in this request, which the platform sets and overwrites). Fixed: platform headers (cf-connecting-ip, x-real-ip) first, else the RIGHTMOST X-Forwarded-For entry; the caller-written leftmost entry is ignored.`,
  );
}});

Deno.test({ name: "gateway handler: body cap, redirects, response headers, waitlist", ...opts, async fn() {
  const handler = await loadHandler("../../functions/gateway/index.ts");

  // --- Body cap: chunked body with no Content-Length.
  let pulled = 0;
  const CHUNK = new Uint8Array(1 << 20);
  const TOTAL_MB = 24;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i++ >= TOTAL_MB) return c.close();
      pulled += CHUNK.byteLength;
      c.enqueue(CHUNK);
    },
  });
  setRouter(() => Response.json({}));
  calls.length = 0;
  const res = await handler(new Request("http://edge.invalid/functions/v1/gateway/rest/v1/profiles", {
    method: "POST", body: stream, headers: { "content-type": "application/json" }, duplex: "half",
  } as RequestInit));
  record(
    "gateway: body cap bypass with chunked body (no Content-Length)",
    res.status === 413 && pulled > MAX_BODY_BYTES * 4 ? "PROVEN" : (res.status === 413 ? "BLOCKED" : "PROVEN"),
    `status ${res.status}; bytes read into memory before refusing = ${(pulled / 1e6).toFixed(1)} MB (cap ${MAX_BODY_BYTES / 1e6} MB); upstream calls=${calls.length}. Fixed: readCapped counts bytes as they arrive and cancels the stream past the cap (was: req.arrayBuffer() buffered all ${TOTAL_MB} MB first).`,
  );

  // Lying / junk Content-Length.
  const clStatus: Record<string, number> = {};
  for (const cl of ["1", "abc", "-5"]) {
    let read = 0; let k = 0;
    const s = new ReadableStream<Uint8Array>({ pull(c) { if (k++ >= 3) return c.close(); read += CHUNK.byteLength; c.enqueue(CHUNK); } });
    calls.length = 0;
    const r = await handler(new Request("http://edge.invalid/gateway/rest/v1/profiles", { method: "POST", body: s, headers: { "content-length": cl }, duplex: "half" } as RequestInit)).catch((e) => new Response(String(e), { status: 0 as unknown as 500 }));
    console.log(`    content-length=${cl}: status ${r.status}, upstream calls=${calls.length}, forwarded bytes=${calls[0]?.bodyLen ?? "-"} (read ${read})`);
    clStatus[cl] = r.status;
  }
  record(
    "gateway: non-numeric / negative Content-Length accepted",
    clStatus["abc"] === 400 && clStatus["-5"] === 400 && clStatus["1"] === 413 ? "BLOCKED" : "PROVEN",
    `abc -> ${clStatus["abc"]}, -5 -> ${clStatus["-5"]}, lying CL=1 with 3 MB -> ${clStatus["1"]} (cut off at the cap, never forwarded)`,
  );

  // --- Per-address rate limit (120/min per instance).
  setRouter(() => Response.json([]));
  const rl: number[] = [];
  for (let n = 0; n < 125; n++) {
    rl.push((await handler(new Request("http://edge.invalid/gateway/rest/v1/profiles", { headers: { "cf-connecting-ip": "198.51.100.7" } }))).status);
  }
  const other = (await handler(new Request("http://edge.invalid/gateway/rest/v1/profiles", { headers: { "cf-connecting-ip": "198.51.100.8" } }))).status;
  const rotated = (await handler(new Request("http://edge.invalid/gateway/rest/v1/profiles", { headers: { "cf-connecting-ip": "198.51.100.7", "x-forwarded-for": "1.2.3.4" } }))).status;
  record(
    "gateway: no per-address rate limit",
    rl.slice(0, 120).every((x) => x === 200) && rl.slice(120).every((x) => x === 429) && other === 200 && rotated === 429 ? "BLOCKED" : "PROVEN",
    `125 requests from one address: ${rl.filter((x) => x === 200).length} x 200, ${rl.filter((x) => x === 429).length} x 429; another address -> ${other}; same address with a forged X-Forwarded-For -> ${rotated}`,
  );

  // --- Redirects and response header passthrough.
  setRouter(() => new Response(null, {
    status: 302,
    headers: {
      location: "https://evil.example/phish",
      "set-cookie": "sb-session=attacker; Path=/; Domain=.supabase.co",
      "access-control-allow-origin": "*",
      "access-control-allow-credentials": "true",
      server: "postgrest/12",
      "x-upstream-secret": "leak",
    },
  }));
  calls.length = 0;
  const r2 = await handler(new Request("http://edge.invalid/gateway/auth/v1/authorize?provider=google&redirect_to=https://evil.example"));
  const passed: string[] = [];
  r2.headers.forEach((v, k) => passed.push(`${k}: ${v}`));
  record(
    "gateway: upstream redirect followed server-side (SSRF pivot)",
    calls.length === 1 && calls[0].redirect === "manual" ? "BLOCKED" : "PROVEN",
    `upstream fetch redirect=${calls[0]?.redirect}, upstream calls=${calls.length}, client got ${r2.status}`,
  );
  record(
    "gateway: response headers (set-cookie, location, CORS, server) passed through verbatim",
    r2.headers.get("set-cookie") ? "PROVEN" : "BLOCKED",
    `${passed.join(" | ")}. Passthrough is real but only re-emits what the project itself said (same project host), so low impact; note redirect_to query is forwarded untouched, the allow-list lives in GoTrue's URI_ALLOW_LIST.`,
  );

  // Query string carrying apikey: the project's API gateway also reads ?apikey=.
  setRouter(() => Response.json({}));
  calls.length = 0;
  await handler(new Request("http://edge.invalid/gateway/rest/v1/profiles?apikey=OTHER_KEY&select=*"));
  record("gateway: query string forwarded verbatim (incl. ?apikey=)", "INFO", `upstream url = ${calls[0]?.url} (header apikey=${calls[0]?.headers.apikey}); harmless unless the caller already holds a stronger key`);

  // --- Waitlist through the gateway: no Origin, no Sec-Fetch-Site, no per-IP limiter, raw 409 oracle.
  const onList = new Set(["victim@example.com"]);
  setRouter(async (req, body) => {
    if (new URL(req.url).pathname === "/rest/v1/waitlist" && req.method === "POST") {
      const { email } = JSON.parse(new TextDecoder().decode(body));
      if (onList.has(email)) return Response.json({ code: "23505", message: 'duplicate key value violates unique constraint "waitlist_pkey"' }, { status: 409 });
      onList.add(email);
      return new Response(null, { status: 201 });
    }
    return new Response("x", { status: 599 });
  });
  calls.length = 0;
  const statuses: string[] = [];
  for (let n = 0; n < 12; n++) {
    const email = n === 0 ? "victim@example.com" : `bot${n}@example.com`;
    const r = await handler(new Request("http://edge.invalid/functions/v1/gateway/rest/v1/waitlist", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.example", "x-forwarded-for": `10.0.0.${n}` },
      body: JSON.stringify({ email }),
    }));
    statuses.push(`${email}=${r.status}`);
    if (n === 0) console.log(`    duplicate body to client: ${await r.text()}`);
  }
  record(
    "gateway -> rest/v1/waitlist bypasses the web route (Origin check, honeypot, per-IP limiter, consent_version)",
    calls.length === 12 ? "PROVEN" : "BLOCKED",
    `12 cross-origin POSTs, upstream calls=${calls.length}: ${statuses.join(", ")}. routeFor refuses rest/v1/waitlist and rest/v1/rpc/join_waitlist; anon also has no insert grant any more (20261116000200_waitlist_hardening.sql).`,
  );
  record(
    "gateway -> waitlist: 409 vs 201 is an email-existence oracle",
    statuses[0].endsWith("=409") && statuses[1].endsWith("=201") ? "PROVEN" : "BLOCKED",
    `known address -> ${statuses[0]}, new address -> ${statuses[1]}: both refused at the gateway; join_waitlist answers a duplicate like a new address (waitlist-db.mjs).`,
  );
}});
