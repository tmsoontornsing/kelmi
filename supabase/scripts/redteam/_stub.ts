// Red-team harness: LOCAL ONLY. Replaces globalThis.fetch with an in-process router and refuses any URL that is not
// the fake project host, so nothing leaves the machine. Run with --cached-only and without --allow-net.

export const STUB_BASE = "http://stub-project.invalid";

export type Verdict = "PROVEN" | "BLOCKED" | "INFO";
export const results: { attack: string; verdict: Verdict; evidence: string }[] = [];
export function record(attack: string, verdict: Verdict, evidence: string) {
  results.push({ attack, verdict, evidence });
  console.log(`\n[${verdict}] ${attack}\n    ${evidence}`);
}

export type Call = { method: string; url: string; headers: Record<string, string>; bodyLen: number; redirect?: string };
export const calls: Call[] = [];
type Router = (req: Request, body: Uint8Array) => Response | Promise<Response>;
let router: Router = () => new Response("no route", { status: 599 });
export const setRouter = (r: Router) => (router = r);

globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const req = new Request(input, init);
  if (!req.url.startsWith(STUB_BASE)) throw new Error(`redteam: refused real network call to ${req.url}`);
  const body = req.body ? new Uint8Array(await req.arrayBuffer()) : new Uint8Array();
  const headers: Record<string, string> = {};
  req.headers.forEach((v, k) => (headers[k] = v));
  calls.push({ method: req.method, url: req.url, headers, bodyLen: body.byteLength, redirect: init?.redirect });
  return await router(req, body);
};

export function setEnv() {
  Deno.env.set("SUPABASE_URL", STUB_BASE);
  Deno.env.set("SUPABASE_ANON_KEY", "ANON.KEY.stub");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "SERVICE.ROLE.stub");
  Deno.env.set("REVENUECAT_IOS_KEY", "appl_stub");
}

// Imports an Edge Function's index.ts and returns the handler it passed to Deno.serve.
let n = 0;
export async function loadHandler(rel: string): Promise<(req: Request) => Promise<Response>> {
  let captured: ((req: Request) => Promise<Response>) | null = null;
  // deno-lint-ignore no-explicit-any
  const d = Deno as any;
  const orig = d.serve;
  d.serve = (h: (req: Request) => Promise<Response>) => {
    captured = h;
    return { finished: Promise.resolve(), shutdown() {}, ref() {}, unref() {}, addr: {} };
  };
  try {
    await import(new URL(`${rel}?redteam=${n++}`, import.meta.url).href);
  } finally {
    d.serve = orig;
  }
  if (!captured) throw new Error(`no handler from ${rel}`);
  return captured;
}

// A fake Supabase project: GoTrue + PostgREST, just enough for the functions under test.
export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const VALID_TOKEN = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMTExIn0.validsig";
export const fakeProject: Router = (req) => {
  const u = new URL(req.url);
  const auth = req.headers.get("authorization") ?? "";
  if (u.pathname === "/auth/v1/user") {
    if (auth === `Bearer ${VALID_TOKEN}`) {
      return Response.json({ id: USER_ID, aud: "authenticated", role: "authenticated", email: "victim@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" });
    }
    return Response.json({ code: 401, msg: "invalid JWT" }, { status: 401 });
  }
  if (u.pathname === `/auth/v1/admin/users/${USER_ID}` && req.method === "GET") {
    return Response.json({ id: USER_ID, email: "victim@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" });
  }
  if (u.pathname === `/auth/v1/admin/users/${USER_ID}` && req.method === "DELETE") return Response.json({});
  if (u.pathname.startsWith("/rest/v1/")) {
    if (req.method === "DELETE") return new Response(null, { status: 204 });
    return Response.json([]); // no profile, no recipes
  }
  return new Response("unrouted", { status: 599 });
};
