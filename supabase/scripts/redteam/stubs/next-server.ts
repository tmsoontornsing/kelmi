// Minimal stand-in for next/server so the website route can run under Deno.
export const NextResponse = {
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
};
