// Red-team tests for the website's POST /api/waitlist. LOCAL ONLY (fetch stubbed, no --allow-net).
//   deno test --cached-only --allow-env --allow-read --import-map=supabase/scripts/redteam/import_map.json supabase/scripts/redteam/web-waitlist.test.ts
import { calls, record, setRouter, STUB_BASE } from "./_stub.ts";

const opts = { sanitizeOps: false, sanitizeResources: false };
Deno.env.set("NEXT_PUBLIC_SUPABASE_URL", STUB_BASE);
Deno.env.set("NEXT_PUBLIC_SUPABASE_ANON_KEY", "ANON.KEY.stub");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "SERVICE.ROLE.stub");
Deno.env.set("NEXT_PUBLIC_SITE_URL", "https://usekavi.com");
const { POST } = await import("../../../apps/web/src/app/api/waitlist/route.ts");

const onList = new Set<string>(["victim@example.com"]);
// Fake PostgREST: the table insert as it was (409 on a duplicate) and join_waitlist as it is now (void, 204 either way,
// service role only).
setRouter(async (req, body) => {
  const path = new URL(req.url).pathname;
  const j = JSON.parse(new TextDecoder().decode(body));
  if (path === "/rest/v1/rpc/join_waitlist") {
    if (req.headers.get("apikey") !== "SERVICE.ROLE.stub") return Response.json({ code: "42501" }, { status: 401 });
    onList.add(j.p_email);
    return new Response(null, { status: 204 });
  }
  if (onList.has(j.email)) return new Response("{}", { status: 409 });
  onList.add(j.email);
  return new Response(null, { status: 201 });
});

const HOST = "usekavi.com";
const req = (h: Record<string, string>, body: BodyInit = JSON.stringify({ email: `p${crypto.randomUUID().slice(0, 8)}@example.com` })) =>
  new Request(`https://${HOST}/api/waitlist`, { method: "POST", headers: { host: HOST, "content-type": "application/json", ...h }, body, duplex: "half" } as RequestInit);

Deno.test({ name: "Origin / Sec-Fetch-Site spoofing", ...opts, async fn() {
  const a = (await POST(req({ origin: "https://evil.example", "x-forwarded-for": "1.1.1.1" }))).status;
  const b = (await POST(req({ origin: "https://evil.example", "x-forwarded-host": "evil.example", "x-forwarded-for": "1.1.1.2" }))).status;
  const c = (await POST(req({ "sec-fetch-site": "same-origin", "x-forwarded-for": "1.1.1.3" }))).status;
  const d = (await POST(req({ origin: "null", "x-forwarded-for": "1.1.1.4" }))).status;
  record("web waitlist: cross-site Origin from a browser", a === 403 && d === 403 ? "BLOCKED" : "PROVEN", `Origin evil -> ${a}, Origin null -> ${d}`);
  const e = (await POST(req({ origin: "https://usekavi.com.evil.example", "x-forwarded-for": "1.1.1.5" }))).status;
  const f = (await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "1.1.1.6" }))).status;
  record(
    "web waitlist: same-site check passes with attacker-set X-Forwarded-Host or Sec-Fetch-Site (non-browser client)",
    b === 200 || c === 200 || e === 200 ? "PROVEN" : "BLOCKED",
    `Origin evil + X-Forwarded-Host evil -> ${b}; no Origin + Sec-Fetch-Site: same-origin -> ${c}; Origin usekavi.com.evil.example -> ${e}; control Origin https://${HOST} -> ${f}. Origin is now compared to a fixed list (NEXT_PUBLIC_SITE_URL, VERCEL_URL, localhost outside production), never to the request's own Host. A script can still send the right Origin, so this stops cross-site browser posts, not bots.`,
  );
}});

Deno.test({ name: "x-forwarded-for rotation vs the per-IP limiter", ...opts, async fn() {
  const same: number[] = [];
  for (let i = 0; i < 7; i++) same.push((await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "9.9.9.9" }))).status);
  const rot: number[] = [];
  calls.length = 0;
  for (let i = 0; i < 40; i++) rot.push((await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": `7.7.${i}.1, 9.9.9.9` }))).status);
  record("web waitlist: same IP is limited", same.includes(429) ? "BLOCKED" : "PROVEN", `same XFF x7 -> ${same.join(",")}`);
  record(
    "web waitlist: rotating X-Forwarded-For evades the per-IP limiter",
    rot.every((s) => s === 200) ? "PROVEN" : "BLOCKED",
    `40 requests, leftmost XFF rotated (real IP 9.9.9.9 already limited): ${rot.filter((s) => s === 200).length}/40 accepted, ${calls.length} upstream calls. The route now keys on x-real-ip (set by Vercel), else the RIGHTMOST XFF entry. The memory-only map still resets per instance; the database throttle is the backstop.`,
  );
}});

Deno.test({ name: "body cap and duplicate oracle", ...opts, async fn() {
  let k = 0;
  const big = new ReadableStream<Uint8Array>({ pull(c) { if (k++ > 100) return c.close(); c.enqueue(new Uint8Array(1024).fill(32)); } });
  const s1 = (await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "5.5.5.1" }, big))).status;
  const s2 = (await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "5.5.5.2", "content-length": "10" }, JSON.stringify({ email: "a@b.co", pad: "x".repeat(5000) })))).status;
  record("web waitlist: body cap bypass (chunked / lying Content-Length)", s1 === 413 && s2 === 413 ? "BLOCKED" : "PROVEN", `chunked 100KB -> ${s1} (stops after 2KB), CL=10 with 5KB -> ${s2}`);
  const dup = await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "5.5.5.3" }, JSON.stringify({ email: "Victim@Example.com" })));
  const fresh = await POST(req({ origin: `https://${HOST}`, "x-forwarded-for": "5.5.5.4" }, JSON.stringify({ email: "brandnew@example.com" })));
  record("web waitlist: 409 existence oracle via the website", dup.status === fresh.status ? "BLOCKED" : "PROVEN", `on-list -> ${dup.status} ${await dup.text()}, new -> ${fresh.status} ${await fresh.text()}`);
  const last = calls.at(-1);
  record(
    "web waitlist: writes with the public anon key straight into the table",
    last && new URL(last.url).pathname === "/rest/v1/rpc/join_waitlist" && last.headers.apikey === "SERVICE.ROLE.stub" ? "BLOCKED" : "PROVEN",
    `upstream ${last?.method} ${last ? new URL(last.url).pathname : "-"} with apikey=${last?.headers.apikey}. The route calls join_waitlist with the server-only SUPABASE_SERVICE_ROLE_KEY; anon has no insert on the table.`,
  );
}});
