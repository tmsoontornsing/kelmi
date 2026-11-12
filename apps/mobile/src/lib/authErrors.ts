// Sorting out why a native sign-in (Google or Apple) failed, so the app can answer the right way. Kept free of React and
// translations, so it can be tested on its own; the wording shown to people lives in nativeSignIn.ts.
//
//  - cancelled:     they closed the sheet. Not an error.
//  - in-progress:   a sign-in sheet is already open.
//  - play-services: Android without a usable Google Play services.
//  - offline:       no connection.
//  - config:        the app and the Supabase project disagree (provider off, client ID not trusted, nonce setting). Retrying will
//                   not help and the person did nothing wrong, so the app falls back to the browser sign-in instead.
//  - unknown:       anything else; the original message is shown.
export type SignInProblem = 'cancelled' | 'in-progress' | 'play-services' | 'offline' | 'config' | 'unknown';

export type Classified = { kind: SignInProblem; hint?: string };

const text = (e: unknown) => {
  if (typeof e === 'string') return e;
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message?: unknown }).message ?? '');
  return '';
};
const code = (e: unknown) => (e && typeof e === 'object' && 'code' in e ? String((e as { code?: unknown }).code ?? '') : '');

export function classifySignInError(e: unknown): Classified {
  const c = code(e);
  const m = text(e).toLowerCase();

  // Google's status codes, and Apple's cancel code.
  if (c === 'SIGN_IN_CANCELLED' || c === '12501' || c === 'ERR_REQUEST_CANCELED' || c === '-5') return { kind: 'cancelled' };
  if (c === 'IN_PROGRESS' || c === 'ERR_REQUEST_NOT_HANDLED') return { kind: 'in-progress' };
  if (c === 'PLAY_SERVICES_NOT_AVAILABLE') return { kind: 'play-services' };

  if (m.includes('network request failed') || m.includes('failed to fetch') || m.includes('network error') || m.includes('internet')) {
    return { kind: 'offline' };
  }

  // Supabase refusing the ID token because of how the project is set up.
  if (m.includes('nonce')) {
    return { kind: 'config', hint: 'Supabase: turn on "Skip nonce checks" for the Google provider (the native Google library cannot set a nonce).' };
  }
  if (m.includes('unacceptable audience') || m.includes('audience')) {
    return { kind: 'config', hint: 'Supabase: add the web client ID (and the iOS client ID) to the Google provider\'s "Authorized Client IDs".' };
  }
  if (m.includes('provider is not enabled') || m.includes('unsupported provider')) {
    return { kind: 'config', hint: 'Supabase: enable the provider under Authentication > Sign In / Providers.' };
  }
  if (m.includes('developer_error') || c === '10' || m.includes('developer error')) {
    return { kind: 'config', hint: 'Google: the OAuth client does not match this build (bundle ID, package name, or SHA-1).' };
  }

  return { kind: 'unknown' };
}
