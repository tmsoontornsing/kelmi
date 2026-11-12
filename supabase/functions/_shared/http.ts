import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Server errors keep the detail in the logs and give the client a short, safe message.
export function fail(fn: string, code: string, detail: string) {
  console.error(`${fn}: ${code}: ${detail}`);
  return json({ error: code, message: "Something went wrong. Try again." }, 500);
}

// The functions are reachable directly at /functions/v1/<name>, not only through the gateway, so each one caps its own
// request body. 64 KB is far more than any real request (the largest, generate-plan with 21 locked meals, is ~2 KB).
export const MAX_JSON_BYTES = 64 * 1024;

// Reads a JSON body with a running byte count, stopping as soon as it passes `maxBytes` (Content-Length may be missing
// or wrong, so it is only used to refuse early). Returns a 413 Response when the body is too large; otherwise the parsed
// value, or null when the body is empty or not JSON (callers already treat that as a bad request).
// deno-lint-ignore no-explicit-any
export async function readJson(req: Request, maxBytes = MAX_JSON_BYTES): Promise<any> {
  const tooLarge = () => json({ error: "payload_too_large" }, 413);
  const declared = req.headers.get("content-length");
  if (declared !== null && (!/^\d{1,15}$/.test(declared.trim()) || Number(declared) > maxBytes)) return tooLarge();
  if (!req.body) return null;
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        return tooLarge();
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder().decode(all));
  } catch {
    return null;
  }
}

// A database client that acts as the caller, so row-level security applies to every read and write,
// plus the caller's user id. Returns a 401 response when the request is not from a signed-in user.
export async function asCaller(req: Request): Promise<{ db: SupabaseClient; userId: string } | Response> {
  const auth = req.headers.get("Authorization");
  const token = auth?.replace(/^Bearer\s+/i, "");
  if (!auth || !token) return json({ error: "unauthorized" }, 401);
  const key = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const db = createClient(Deno.env.get("SUPABASE_URL")!, key!, {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false },
  });
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "unauthorized" }, 401);
  return { db, userId: data.user.id };
}

// A client with the service role key, which bypasses row-level security. Only for work the caller must not be able to
// do for themselves (claiming a plan request, deleting an account), and only ever with a user id that asCaller verified.
export function adminClient(): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

// Per-person rate limit for functions that don't have their own cap. Returns a 429 Response when the person is over
// `max` calls in `windowSeconds`, otherwise null. A failure of the limiter itself lets the request through (it is a
// second line of defence behind sign-in and the gateway's per-IP limit, and should not take the app down).
export async function rateLimited(userId: string, bucket: string, max: number, windowSeconds: number): Promise<Response | null> {
  const { data, error } = await adminClient().rpc("hit_rate_limit", {
    p_user: userId,
    p_bucket: bucket,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error(`rate limit ${bucket}: ${error.message}`);
    return null;
  }
  if (data === false) {
    return new Response(JSON.stringify({ error: "rate_limited", message: "Too many requests. Try again in a minute." }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(windowSeconds) },
    });
  }
  return null;
}
