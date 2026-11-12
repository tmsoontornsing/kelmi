import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { t } from '../i18n';
import { classifySignInError, type SignInProblem } from './authErrors';
import { supabase } from './supabase';

// Native Apple and Google sign-in. Each hands Supabase an ID token (signInWithIdToken), so there is no browser sheet.
// The same call signs a returning person in and creates the account for a new one: Supabase makes the user the first time
// it sees a provider identity, and links it to an existing account that has the same verified email.
//
// 'unavailable' means this build cannot do it natively, and the caller falls back to the browser flow. That covers Expo Go,
// Android for Apple, a missing client ID, and a project setting that stops native tokens (see authErrors.ts, 'config').
// Closing the system sheet is 'cancelled'. Real failures throw an Error whose message is ready to show.
export type NativeResult = 'done' | 'cancelled' | 'unavailable';
export type NativeProvider = 'apple' | 'google';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

// The words for each kind of failure. 'config' is never shown: the app signs the person in through the browser instead.
function problemMessage(kind: SignInProblem, original: string): string {
  switch (kind) {
    case 'offline':
      return t('No connection. Check your internet and try again.');
    case 'in-progress':
      return t('A sign-in window is already open.');
    case 'play-services':
      return t('Google Play services are missing or out of date.');
    default:
      return original || t('Sign-in did not finish. Try again.');
  }
}

// Turns whatever the sign-in sheet threw into 'cancelled' or an Error to show.
function failed(e: unknown): 'cancelled' {
  const found = classifySignInError(e);
  if (found.kind === 'cancelled') return 'cancelled';
  throw new Error(problemMessage(found.kind, e instanceof Error ? e.message : ''));
}

// Gives Supabase the provider's ID token. A project-setting problem becomes 'unavailable' (the browser flow takes over),
// with a plain note in development saying which setting to change.
async function exchange(args: { provider: NativeProvider; token: string; nonce?: string }): Promise<NativeResult> {
  const { error } = await db().auth.signInWithIdToken(args);
  if (!error) return 'done';
  const found = classifySignInError(error);
  if (found.kind === 'config') {
    if (__DEV__) console.warn(`[sign-in] Native ${args.provider} sign-in was refused, using the browser instead. ${found.hint ?? error.message}`);
    return 'unavailable';
  }
  throw new Error(problemMessage(found.kind, error.message));
}

// Apple wants the SHA-256 of a random nonce; Supabase wants the raw one back so it can check the token was made for us.
async function newNonce() {
  const raw = Array.from(Crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
  const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, raw);
  return { raw, hashed };
}

async function withApple(): Promise<NativeResult> {
  if (Platform.OS !== 'ios') return 'unavailable';
  let AppleAuthentication: typeof import('expo-apple-authentication');
  try {
    AppleAuthentication = await import('expo-apple-authentication');
    if (!(await AppleAuthentication.isAvailableAsync())) return 'unavailable';
  } catch {
    return 'unavailable';
  }

  const nonce = await newNonce();
  let identityToken: string | null;
  try {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: nonce.hashed,
    });
    identityToken = credential.identityToken;
  } catch (e) {
    return failed(e);
  }
  if (!identityToken) throw new Error(t('Sign-in did not finish. Try again.'));

  return exchange({ provider: 'apple', token: identityToken, nonce: nonce.raw });
}

type GoogleModule = typeof import('@react-native-google-signin/google-signin');
let googleConfigured = false;

// The Google library, set up once, or null when this build has none (Expo Go) or no client ID is set.
async function loadGoogle(): Promise<GoogleModule | null> {
  if (!googleWebClientId) return null;
  try {
    const mod = await import('@react-native-google-signin/google-signin');
    if (!mod.GoogleSignin) return null;
    if (!googleConfigured) {
      // webClientId is what Supabase's Google provider trusts; iosClientId is the separate iOS OAuth client.
      mod.GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId });
      googleConfigured = true;
    }
    return mod;
  } catch {
    return null;
  }
}

async function withGoogle(): Promise<NativeResult> {
  const mod = await loadGoogle();
  if (!mod) return 'unavailable';
  if (Platform.OS === 'android') {
    try {
      await mod.GoogleSignin.hasPlayServices();
    } catch {
      return 'unavailable';
    }
  }

  let idToken: string | null;
  try {
    const response = await mod.GoogleSignin.signIn();
    if (response.type !== 'success') return 'cancelled';
    idToken = response.data.idToken;
  } catch (e) {
    return failed(e);
  }
  if (!idToken) throw new Error(t('Sign-in did not finish. Try again.'));

  return exchange({ provider: 'google', token: idToken });
}

export const signInNative = (provider: NativeProvider): Promise<NativeResult> =>
  provider === 'apple' ? withApple() : withGoogle();

// Signing out of Kelmi should also forget the Google account, so the next sign-in offers the account picker.
export async function signOutNative() {
  const mod = await loadGoogle();
  if (!mod) return;
  try {
    await mod.GoogleSignin.signOut();
  } catch {
    // Nothing to clear.
  }
}

// When an account is deleted, also take back the access Kelmi was given to the person's Google account, so it no longer
// lists Kelmi among the apps that can sign in. Best effort: deleting the account never waits on it.
export async function revokeNativeAccess() {
  const mod = await loadGoogle();
  if (!mod) return;
  try {
    if (mod.GoogleSignin.hasPreviousSignIn()) await mod.GoogleSignin.revokeAccess();
  } catch {
    // The account is already gone; Google's own settings page can still remove the app.
  }
}
