// Red-team tests for asCaller and the app's Edge Functions. LOCAL ONLY: a fake GoTrue/PostgREST answers every fetch
// (_stub.ts), and the run has no --allow-net.
//   deno test --cached-only --allow-env --allow-read supabase/scripts/redteam/functions.test.ts
import { calls, fakeProject, loadHandler, record, setEnv, setRouter, USER_ID, VALID_TOKEN } from "./_stub.ts";
import { isMonday } from "../../functions/_shared/plan-logic.ts";

const opts = { sanitizeOps: false, sanitizeResources: false };
setEnv();
setRouter(fakeProject);

const FN = (name: string) => `../../functions/${name}/index.ts`;
const post = (body: unknown, auth: string | null = `Bearer ${VALID_TOKEN}`, raw?: BodyInit) =>
  new Request("http://edge.invalid/functions/v1/x", {
    method: "POST",
    headers: { "content-type": "application/json", ...(auth === null ? {} : { authorization: auth }) },
    body: raw ?? JSON.stringify(body),
  });

Deno.test({ name: "asCaller: missing / forged Authorization", ...opts, async fn() {
  const h = await loadHandler(FN("app-config"));
  const cases: [string, string | null][] = [
    ["none", null],
    ["empty", ""],
    ["'Bearer '", "Bearer "],
    ["'Bearer'", "Bearer"],
    ["forged alg=none service_role", "Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoic2VydmljZV9yb2xlIiwic3ViIjoiMTExMSJ9."],
    ["anon key as bearer", "Bearer ANON.KEY.stub"],
    ["service key string", "Bearer SERVICE.ROLE.stub"],
    ["two tokens", `Bearer junk.junk.junk, Bearer ${VALID_TOKEN}`],
    ["Basic", "Basic dXNlcjpwYXNz"],
  ];
  const got: string[] = [];
  let leaked = false;
  for (const [label, a] of cases) {
    const r = await h(new Request("http://edge.invalid/x", { method: "GET", headers: a === null ? {} : { authorization: a } }));
    got.push(`${label}=${r.status}`);
    if (r.status === 200) leaked = true;
  }
  const ok = await h(new Request("http://edge.invalid/x", { method: "GET", headers: { authorization: `bearer ${VALID_TOKEN}` } }));
  const bare = await h(new Request("http://edge.invalid/x", { method: "GET", headers: { authorization: VALID_TOKEN } }));
  record("asCaller (via app-config): missing/forged/odd Authorization reaches the handler", leaked ? "PROVEN" : "BLOCKED", `${got.join(", ")}; control: valid lowercase 'bearer'=${ok.status}`);
  record(
    "asCaller: Authorization without the 'Bearer ' scheme is accepted",
    bare.status === 200 ? "PROVEN" : "BLOCKED",
    `Authorization: <jwt> (no scheme) -> ${bare.status}. Harmless (still a real session token), noted because the raw header, not the verified token, is what the db client forwards (http.ts:15-20).`,
  );
}});

// Tokens with a sign-in time in their amr claim. The fake GoTrue accepts them like VALID_TOKEN.
const b64url = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const nowS = () => Math.floor(Date.now() / 1000);
const tokenSignedInAt = (t: number) => `eyJhbGciOiJIUzI1NiJ9.${b64url({ sub: USER_ID, iat: nowS(), amr: [{ method: "password", timestamp: t }] })}.validsig`;
const FRESH = tokenSignedInAt(nowS() - 60);
const STALE = tokenSignedInAt(nowS() - 2 * 3600); // signed in 2 h ago, token just refreshed (iat = now)
const REFRESHED = `eyJhbGciOiJIUzI1NiJ9.${b64url({ sub: USER_ID, iat: nowS(), amr: [{ method: "password", timestamp: nowS() - 7200 }, { method: "token_refresh", timestamp: nowS() - 60 }] })}.validsig`;
const withExtraTokens = (req: Request, body: Uint8Array) => {
  const a = req.headers.get("authorization");
  if (new URL(req.url).pathname === "/auth/v1/user" && (a === `Bearer ${FRESH}` || a === `Bearer ${STALE}` || a === `Bearer ${REFRESHED}`)) {
    return Response.json({ id: USER_ID, aud: "authenticated", role: "authenticated", email: "victim@example.com", email_confirmed_at: "2026-01-01T00:00:00Z" });
  }
  return fakeProject(req, body);
};

Deno.test({ name: "delete-account: any valid bearer deletes with no re-auth", ...opts, async fn() {
  const h = await loadHandler(FN("delete-account"));
  setRouter(withExtraTokens);
  const del = `DELETE /auth/v1/admin/users/${USER_ID}`;
  const attempt = async (label: string, body: unknown, token: string) => {
    calls.length = 0;
    const r = await h(post(body, `Bearer ${token}`));
    const j = await r.json().catch(() => ({}));
    const deleted = calls.some((c) => `${c.method} ${new URL(c.url).pathname}` === del);
    return { label, status: r.status, error: j.error ?? (j.deleted ? "deleted" : ""), deleted };
  };
  const attacks = [
    await attempt("bare token, empty body", {}, VALID_TOKEN),
    await attempt("bare token (no amr), confirm", { confirm: "DELETE" }, VALID_TOKEN),
    await attempt("token refreshed now but signed in 2h ago, confirm", { confirm: "DELETE" }, STALE),
    await attempt("fresh sign-in, no confirm", {}, FRESH),
    await attempt("signed in 2h ago, refreshed 1 min ago (amr token_refresh)", { confirm: "DELETE" }, REFRESHED),
    await attempt("fresh sign-in, confirm=delete (wrong case)", { confirm: "delete" }, FRESH),
  ];
  const control = await attempt("fresh sign-in, confirm", { confirm: "DELETE" }, FRESH);
  const summary = [...attacks, control].map((a) => `${a.label} -> ${a.status} ${a.error}${a.deleted ? " [DELETED]" : ""}`).join("; ");
  console.log("    " + summary);
  record(
    "delete-account: a bare access token (no password/OTP/recent-login/confirmation) permanently deletes the account",
    attacks.some((a) => a.deleted) ? "PROVEN" : "BLOCKED",
    `${summary}. Needs body {confirm:"DELETE"} and an amr sign-in time within 10 min (iat alone does not count, a refresh renews it).`,
  );
  record("delete-account: legitimate fresh sign-in still works", control.deleted && control.status === 200 ? "INFO" : "PROVEN", `${control.status} ${control.error}`);
  const r2 = await h(post({ confirm: "DELETE" }, null));
  record("delete-account: without a token", r2.status === 401 ? "BLOCKED" : "PROVEN", `no Authorization -> ${r2.status}`);
  setRouter(fakeProject);
}});

Deno.test({ name: "generate-plan input fuzz", ...opts, async fn() {
  const h = await loadHandler(FN("generate-plan"));
  // 409 profile_missing means validation passed and the request went on to the database; 400 means refused.
  const probe = async (label: string, body: unknown, raw?: BodyInit) => {
    const r = await h(post(body, `Bearer ${VALID_TOKEN}`, raw));
    const j = await r.json().catch(() => ({}));
    return `${label}=${r.status}${j.error ? `(${j.error})` : ""}`;
  };
  const dates = [
    await probe("9999-12-27", { week_start: "9999-12-27" }),
    await probe("0001-01-01", { week_start: "0001-01-01" }),
    await probe("1900-01-01", { week_start: "1900-01-01" }),
    await probe("2026-11-10(Tue)", { week_start: "2026-11-10" }),
    await probe("2026-02-30", { week_start: "2026-02-30" }),
    await probe("number", { week_start: 20261116 }),
    await probe("array", { week_start: ["2026-11-16"] }),
    await probe("+02026-11-16", { week_start: "+02026-11-16" }),
  ];
  // Control: the coming Monday is still accepted (409 = validation passed, no profile in the fake project).
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7));
  const nextMonday = d.toISOString().slice(0, 10);
  const control = await probe(`next Monday ${nextMonday}`, { week_start: nextMonday });
  console.log(`    control: ${control}`);
  record(
    "generate-plan: week_start far past/future (year 0001 / 9999)",
    (dates[0].includes("409") || dates[1].includes("409")) ? "PROVEN" : control.includes("409") ? "BLOCKED" : "PROVEN",
    `${dates.join(", ")}. Fixed: week_start must also be within -7..+400 days of today (was: any Monday 0001-9999 passed isMonday).`,
  );

  const lockOne = { day_of_week: 1, meal_type: "dinner", recipe_id: "r1" };
  const locks = [
    await probe("locked=string", { locked: "x" }),
    await probe("locked x22", { locked: Array.from({ length: 22 }, () => lockOne) }),
    await probe("locked dup", { locked: [lockOne, lockOne] }),
    await probe("locked day=8", { locked: [{ ...lockOne, day_of_week: 8 }] }),
    await probe("locked __proto__ meal", { locked: [{ ...lockOne, meal_type: "__proto__" }] }),
    await probe("locked 1e5 array", { locked: Array.from({ length: 100_000 }, () => lockOne) }),
  ];
  record("generate-plan: malformed / oversized locked[]", locks.every((l) => /=4(00|13)\(/.test(l)) ? "BLOCKED" : "PROVEN", locks.join(", ") + " (413 = refused by the 64 KB body cap before parsing)");

  const before = ({} as Record<string, unknown>).week_start;
  const proto = [
    await probe("__proto__.week_start", null, '{"__proto__":{"week_start":"2026-11-10","locked":"x"}}'),
    await probe("constructor.prototype", null, '{"constructor":{"prototype":{"polluted":1}}}'),
  ];
  const polluted = ({} as Record<string, unknown>).week_start !== before || ({} as Record<string, unknown>).polluted !== undefined;
  record("generate-plan: prototype-pollution keys in JSON body", polluted ? "PROVEN" : "BLOCKED", `${proto.join(", ")}; Object.prototype polluted=${polluted} (JSON.parse makes __proto__ an own key)`);

  // No body cap inside the function: reached directly at /functions/v1/generate-plan (verify_jwt=false) the gateway's
  // 1.5 MB limit does not apply.
  const big = '{"pad":"' + "a".repeat(30_000_000) + '"}';
  const t0 = performance.now();
  const b = await probe("30MB body", null, big);
  record(
    "generate-plan (and grocery-list/meal-options/delete-account): no in-function body cap when called directly, bypassing the gateway",
    b.includes("409") ? "PROVEN" : "BLOCKED",
    `${b} after ${(performance.now() - t0).toFixed(0)} ms. Fixed: readJson (http.ts) stops at 64 KB, used by generate-plan, grocery-list, meal-options and delete-account.`,
  );
  console.log(`    isMonday('9999-12-27')=${isMonday("9999-12-27")}`);
}});

Deno.test({ name: "meal-options / grocery-list fuzz", ...opts, async fn() {
  const mo = await loadHandler(FN("meal-options"));
  const s = async (b: unknown) => (await mo(post(b))).status;
  const types = { proto: await s({ meal_type: "__proto__" }), ctor: await s({ meal_type: "constructor" }), arr: await s({ meal_type: ["dinner"] }), num: await s({ meal_type: 1 }) };
  record("meal-options: meal_type type confusion / proto keys", Object.values(types).every((x) => x === 400) ? "BLOCKED" : "PROVEN", JSON.stringify(types));
  const huge = Array.from({ length: 2_000_000 }, (_, i) => `id-${i}`);
  const t0 = performance.now();
  const st = await s({ meal_type: "dinner", exclude: huge });
  const ms = performance.now() - t0;
  record(
    "meal-options: huge exclude[] processed before the 50-item cut",
    st === 409 && ms > 50 ? "PROVEN" : "BLOCKED",
    `2,000,000-item exclude -> ${st} after ${ms.toFixed(0)} ms (refused by the 64 KB body cap); within the cap the list is now cut to 50 before it is filtered.`,
  );
  const small = Array.from({ length: 5_000 }, (_, i) => `id-${i}`);
  const t1 = performance.now();
  const st2 = await s({ meal_type: "dinner", exclude: small });
  record(
    "meal-options: exclude[] under the body cap",
    "INFO",
    `5,000-item exclude (~60 KB) -> ${st2} in ${(performance.now() - t1).toFixed(0)} ms; slice(0, 50) runs before filter.`,
  );

  const gl = await loadHandler(FN("grocery-list"));
  const g = async (b: unknown) => (await gl(post(b))).status;
  const U = "22222222-2222-4222-8222-222222222222";
  const res = {
    notUuid: await g({ plan_id: "1 or 1=1" }),
    shop22: await g({ plan_id: U, shop: Array.from({ length: 22 }, () => ({ day_of_week: 1, meal_type: "dinner", shop: true })) }),
    day0: await g({ plan_id: U, shop: [{ day_of_week: 0, meal_type: "dinner", shop: true }] }),
    shopStr: await g({ plan_id: U, shop: [{ day_of_week: 1, meal_type: "dinner", shop: "yes" }] }),
    proto: await g(JSON.parse(`{"plan_id":"${U}","__proto__":{"build_list":false}}`)),
  };
  record("grocery-list: zod schema fuzz", res.notUuid === 400 && res.shop22 === 400 && res.day0 === 400 && res.shopStr === 400 ? "BLOCKED" : "PROVEN", JSON.stringify(res) + " (proto case reaches profile lookup as a normal request: 409)");
}});
