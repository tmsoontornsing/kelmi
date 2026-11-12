// Route parameters can arrive from a deep link (kelmi://age?next=...), so none of them is trusted as a place to go or a
// thing to do. Each is checked against the exact values Kelmi's own screens send, and anything else falls back to a safe
// default. Plain functions with no app imports, so `node --test` can run the tests beside this file.

// Where the age screen may continue to. These are the only values the app sends: welcome.tsx (both buttons), the age
// guard in _layout.tsx, and AppState when the server asks for an age before planning.
const AGE_NEXT = new Set(['/onboarding/diet', '/onboarding/save', '/onboarding/save?from=welcome', '/week']);
export const DEFAULT_AGE_NEXT = '/onboarding/diet';

export function safeAgeNext(value: unknown): string {
  return typeof value === 'string' && AGE_NEXT.has(value) ? value : DEFAULT_AGE_NEXT;
}

// The sign-in sheet only knows one origin: "I Already Have an Account" on the welcome screen.
export function safeAuthFrom(value: unknown): 'welcome' | undefined {
  return value === 'welcome' ? 'welcome' : undefined;
}

// What the allergy notice and the AI choice may carry on with once answered. Only "plan" exists.
export function safeThen(value: unknown): 'plan' | undefined {
  return value === 'plan' ? 'plan' : undefined;
}

// True when `url` is a deep link that opens `screen` (for example kelmi://ai-consent?then=plan, or
// exp+kelmi://.../--/ai-consent in development). A screen opened that way did not come from the app's own flow.
export function isLinkTo(url: string | null | undefined, screen: string): boolean {
  if (!url) return false;
  let path: string;
  try {
    const parsed = new URL(url);
    // For custom schemes the first segment parses as the host (kelmi://ai-consent), so join it back onto the path.
    path = `${parsed.host}${parsed.pathname}`;
  } catch {
    return false;
  }
  const parts = path.split('/').filter(Boolean);
  // Expo's development URLs put the route after a `--` segment.
  const dash = parts.indexOf('--');
  const route = dash >= 0 ? parts.slice(dash + 1) : parts;
  return route[0]?.toLowerCase() === screen.toLowerCase();
}

// Email links come back with either a PKCE code or a token hash and its type. A token hash is not tied to this phone, so
// only the email-confirmation types are read here (Kelmi sends no magic links or invites), and the screen also requires a
// sign-up started on this phone.
const OTP_TYPES = new Set(['signup', 'email'] as const);
export type CallbackOtpType = 'signup' | 'email';

export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'otp'; tokenHash: string; type: CallbackOtpType }
  | { kind: 'error'; message: string }
  | { kind: 'empty' };

const one = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const clean = (v: unknown) => {
  const s = one(v);
  // Codes and hashes are short tokens; anything long or with odd characters is not one.
  return typeof s === 'string' && /^[A-Za-z0-9._~-]{6,512}$/.test(s) ? s : null;
};

export function parseAuthCallback(params: Record<string, unknown>): AuthCallback {
  const error = one(params.error_description) ?? one(params.error);
  if (typeof error === 'string' && error) return { kind: 'error', message: error.slice(0, 300) };
  const code = clean(params.code);
  if (code) return { kind: 'code', code };
  const tokenHash = clean(params.token_hash);
  const type = one(params.type);
  if (tokenHash && typeof type === 'string' && OTP_TYPES.has(type as CallbackOtpType)) {
    return { kind: 'otp', tokenHash, type: type as CallbackOtpType };
  }
  return { kind: 'empty' };
}

// Whether the allergy notice or the AI choice should start planning the week once the person answers. Only when the
// app's own "plan my week" step opened the sheet: `then` is "plan", the sheet was not opened by a deep link (`linkUrl`,
// the most recent link the app received), and `inFlow` (the consent state that step requires) holds. Planning still only
// starts after a tap on the sheet, never when it opens.
export function planAfterNotice(then: unknown, linkUrl: string | null | undefined, screen: string, inFlow: boolean): boolean {
  return safeThen(then) === 'plan' && inFlow && !isLinkTo(linkUrl, screen);
}
