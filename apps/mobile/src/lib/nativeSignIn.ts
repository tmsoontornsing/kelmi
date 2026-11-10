import * as Crypto from 'expo-crypto';
import { Platform } from 'react-native';

import { t } from '../i18n';
import { supabase } from './supabase';

// Native Apple and Google sign-in. Each hands Supabase an ID token (signInWithIdToken), so there is no browser sheet.
// 'unavailable' means this build cannot do it (Expo Go, Android for Apple, or no client ID set), and the caller falls
// back to the browser flow. Real failures throw; closing the system sheet is 'cancelled'.
export type NativeResult = 'done' | 'cancelled' | 'unavailable';
export type NativeProvider = 'apple' | 'google';

const googleWebClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const googleIosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;

const db = () => {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
};

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
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    throw e;
  }
  if (!identityToken) throw new Error(t('Sign-in did not finish. Try again.'));

  const { error } = await db().auth.signInWithIdToken({ provider: 'apple', token: identityToken, nonce: nonce.raw });
  if (error) throw new Error(error.message);
  return 'done';
}

let googleConfigured = false;

async function withGoogle(): Promise<NativeResult> {
  if (!googleWebClientId) return 'unavailable';
  let mod: typeof import('@react-native-google-signin/google-signin');
  try {
    mod = await import('@react-native-google-signin/google-signin');
    if (!mod.GoogleSignin) return 'unavailable';
    if (!googleConfigured) {
      // webClientId is what Supabase's Google provider trusts; iosClientId is the separate iOS OAuth client.
      mod.GoogleSignin.configure({ webClientId: googleWebClientId, iosClientId: googleIosClientId });
      googleConfigured = true;
    }
    if (Platform.OS === 'android') await mod.GoogleSignin.hasPlayServices();
  } catch {
    return 'unavailable';
  }

  let idToken: string | null;
  try {
    const response = await mod.GoogleSignin.signIn();
    if (response.type !== 'success') return 'cancelled';
    idToken = response.data.idToken;
  } catch (e) {
    if ((e as { code?: string }).code === mod.statusCodes.SIGN_IN_CANCELLED) return 'cancelled';
    throw e;
  }
  if (!idToken) throw new Error(t('Sign-in did not finish. Try again.'));

  const { error } = await db().auth.signInWithIdToken({ provider: 'google', token: idToken });
  if (error) throw new Error(error.message);
  return 'done';
}

export const signInNative = (provider: NativeProvider): Promise<NativeResult> =>
  provider === 'apple' ? withApple() : withGoogle();

// Signing out of Kelmi should also forget the Google account, so the next sign-in offers the account picker.
export async function signOutNative() {
  if (!googleConfigured) return;
  try {
    const { GoogleSignin } = await import('@react-native-google-signin/google-signin');
    await GoogleSignin.signOut();
  } catch {
    // Nothing to clear.
  }
}
