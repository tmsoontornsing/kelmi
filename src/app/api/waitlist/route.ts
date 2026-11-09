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

// Inserts through Supabase's REST API with the anon key. The `waitlist` table allows insert of the email and consent_version
// columns only (see migrations 20261109000000_waitlist.sql and 20261115000000_waitlist_throttle.sql), so the key cannot read, change or delete anyone's address.
// A new address and one already on the list get the same answer, so the form cannot be used to find out who is on the list.
export async function POST(req: Request) {
  // Only our own pages may post here. Browsers send Origin on POSTs; if it is missing, accept only a same-origin fetch
  // (Sec-Fetch-Site), which every current browser sends on the site's own form.
  const origin = req.headers.get('origin');
  const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host');
  let sameSite = false;
  if (origin) {
    try { sameSite = new URL(origin).host === host; } catch {}
  } else {
    sameSite = req.headers.get('sec-fetch-site') === 'same-origin';
  }
  if (!sameSite) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  if (!(req.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return NextResponse.json({ error: 'unsupported_media_type' }, { status: 415 });
  }

  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
  if (limited(ip)) return NextResponse.json({ error: 'rate_limited' }, { status: 429 });

  const text = await readBody(req).catch(() => null);
  if (text === null) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  let body: { email?: unknown; website?: unknown } | null = null;
  try { body = JSON.parse(text); } catch {}
  const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
  // Bots fill the hidden field. Pretend it worked.
  if (body?.website) return NextResponse.json({ ok: true });
  if (email.length > 254 || !EMAIL.test(email)) return NextResponse.json({ error: 'invalid_email' }, { status: 400 });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const res = await fetch(`${url}/rest/v1/waitlist`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json', prefer: 'return=minimal' },
    body: JSON.stringify({ email, consent_version: CONSENT_VERSION }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  // A duplicate comes back from Supabase as 409 (unique violation). Treat it as success so the answer is the same either way.
  if (res?.status === 409) return NextResponse.json({ ok: true });
  if (!res || !res.ok) return NextResponse.json({ error: 'failed' }, { status: 502 });
  return NextResponse.json({ ok: true });
}
