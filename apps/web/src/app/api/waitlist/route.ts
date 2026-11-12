import { NextResponse } from 'next/server';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BODY_BYTES = 2048;
// Which privacy notice the person agreed to by joining (the date of legal/privacy.md's waitlist section). Saved in
// waitlist.consent_version (migration 20261115000000_waitlist_throttle.sql, at most 40 characters). Change it when the notice changes.
const CONSENT_VERSION = 'waitlist-2026-11-05';

// Per-IP limit: 5 attempts per 10 minutes. This is best effort only. The counts live in this server instance's memory, so on a
// serverless host (many short-lived instances, each with its own memory) a determined caller can get past it, and the counts
// reset on every cold start. It slows down casual abuse; it is not a security boundary. For a hard limit use the host's
// firewall or rate-limit rules, or a shared store.
const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;
const hits = new Map<string, { n: number; reset: number }>();

function limited(ip: string): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  if (hits.size > 5000) hits.clear(); // still full of live entries: drop them rather than grow without bound
  const h = hits.get(ip);
  if (!h || h.reset <= now) {
    hits.set(ip, { n: 1, reset: now + WINDOW_MS });
    return false;
  }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

// Reads the body as a stream and stops at MAX_BODY_BYTES. Content-Length can be missing or wrong, so it is not trusted.
async function readBody(req: Request): Promise<string | null> {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

// Pages allowed to post here. NEXT_PUBLIC_SITE_URL (one origin, or several separated by commas) names the live site;
// Vercel's own VERCEL_URL covers the deployment being served (previews included); localhost only outside production.
// The request's own Host / X-Forwarded-Host are not used, because a non-browser caller can set them to anything.
function allowedOrigins(): Set<string> {
  const list = new Set<string>(['https://usekavi.com', 'https://www.usekavi.com']);
  for (const o of (process.env.NEXT_PUBLIC_SITE_URL ?? '').split(',')) {
    try { if (o.trim()) list.add(new URL(o.trim()).origin); } catch {}
  }
  if (process.env.VERCEL_URL) list.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.NODE_ENV !== 'production') {
    for (const port of ['3000', '3001']) { list.add(`http://localhost:${port}`); list.add(`http://127.0.0.1:${port}`); }
  }
  return list;
}

// The caller's address as the host reports it. Vercel sets x-real-ip (and overwrites x-forwarded-for) itself; failing
// that, only the LAST x-forwarded-for entry was added by a proxy, the earlier ones are whatever the caller sent.
function clientIp(req: Request): string {
  const real = req.headers.get('x-real-ip')?.trim() || req.headers.get('x-vercel-forwarded-for')?.split(',')[0]?.trim();
  if (real) return real;
  const xff = (req.headers.get('x-forwarded-for') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) ?? 'unknown';
}

// Adds the address through public.join_waitlist (migration 20261116000200_waitlist_hardening.sql), which only the service
// role may call: the public anon key can no longer write to the waitlist at all. SUPABASE_SERVICE_ROLE_KEY is read here,
// on the server, and must never be given a NEXT_PUBLIC_ name. The function answers the same way for a new address and
// one already on the list, so the form cannot be used to find out who is on it.
export async function POST(req: Request) {
  // Only our own pages may post here. Browsers always send Origin on a POST; a request without one is not from our form.
  // (This stops cross-site posts from browsers. A script can send any Origin it likes, which is why the per-address limit
  // and the database's own throttle sit behind it.)
  const origin = req.headers.get('origin');
  if (!origin || !allowedOrigins().has(origin)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  if (limited(clientIp(req))) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const text = await readBody(req).catch(() => null);
  if (text === null) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  let body: { email?: unknown; website?: unknown } | null = null;
  try { body = JSON.parse(text); } catch {}
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Bots fill the hidden field. Pretend it worked.
  if (body?.website) return NextResponse.json({ ok: true });
  if (email.length > 254 || !EMAIL.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const res = await fetch(`${url}/rest/v1/rpc/join_waitlist`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ p_email: email, p_consent_version: CONSENT_VERSION }),
    signal: AbortSignal.timeout(8000),
    cache: 'no-store',
  }).catch(() => null);
  if (res && !res.ok) {
    const err = await res.json().catch(() => null);
    if (err?.hint === 'waitlist_throttled') return NextResponse.json({ error: 'busy' }, { status: 429 });
  }
  if (!res || !res.ok) return NextResponse.json({ error: 'failed' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
