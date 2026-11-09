import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.118.0";

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

// Server errors keep the detail in the logs and give the client a short, safe message.
export function fail(fn: string, code: string, detail: string) {
  console.error(`${fn}: ${code}: ${detail}`);
  return json({ error: code, message: "Something went wrong. Try again." }, 500);
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
