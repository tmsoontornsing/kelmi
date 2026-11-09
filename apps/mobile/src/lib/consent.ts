import AsyncStorage from '@react-native-async-storage/async-storage';

import { TERMS_VERSION } from '../legal/config';
import { recordConsent } from './api';

const AGE_KEY = 'kavi.age.v3';
const OLD_AGE_KEY = 'kavi.age.v2';
const CONSENT_KEY = 'kavi.consent.pending';
const AI_ASKED_KEY = 'kavi.ai.asked.';

// Kelmi is for people 13 and older. The age screen asks for birth month and year with nothing pre-selected, and keeps the
// answer on the phone so someone under 13 cannot go back and try a different year. (v3: the v2 answer was for 18 and
// older. A v2 'ok' is still ok, since 18+ is also 13+, but a v2 'blocked' is asked again.) The server keeps its own
// record, set by record_consent('age') once there is an account.
export type AgeStatus = 'unknown' | 'ok' | 'blocked';
export const MIN_AGE = 13;

export async function getAgeStatus(): Promise<AgeStatus> {
  try {
    const v = await AsyncStorage.getItem(AGE_KEY);
    if (v === 'ok' || v === 'blocked') return v;
    if ((await AsyncStorage.getItem(OLD_AGE_KEY)) === 'ok') return 'ok';
    return 'unknown';
  } catch {
    return 'unknown';
  }
}

// Whole months since the birth month. Born in the month of their 13th birthday counts as under 13, so a close call
// never lets a younger person through.
export function meetsMinimumAge(month: number, year: number, now = new Date()) {
  const months = (now.getFullYear() - year) * 12 + (now.getMonth() + 1 - month);
  return months > MIN_AGE * 12;
}

export async function setAgeStatus(status: 'ok' | 'blocked') {
  try {
    await AsyncStorage.setItem(AGE_KEY, status);
  } catch {}
}

// The checkbox is ticked before an account exists, so the acceptance waits on the phone until there is a signed-in user
// to attach it to (which may be after the person confirms their email).
export async function markConsentPending() {
  try {
    await AsyncStorage.setItem(CONSENT_KEY, JSON.stringify({ at: new Date().toISOString() }));
  } catch {}
}

// Once signed in: tell the server the person met the age check and accepted the Terms. The server stamps the time itself. Stays
// pending, and is tried again at the next sign-in, until both calls go through.
export async function saveConsent() {
  try {
    if (!(await AsyncStorage.getItem(CONSENT_KEY))) return;
    if ((await getAgeStatus()) === 'ok') await recordConsent('age');
    await recordConsent('terms', TERMS_VERSION);
    await AsyncStorage.removeItem(CONSENT_KEY);
  } catch {}
}

// "Not now" on the AI screen is remembered per account on this phone, so Kelmi asks once and then only from Settings.
export async function getAiAsked(userId: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(AI_ASKED_KEY + userId)) === '1';
  } catch {
    return false;
  }
}

export async function setAiAsked(userId: string, asked: boolean) {
  try {
    if (asked) await AsyncStorage.setItem(AI_ASKED_KEY + userId, '1');
    else await AsyncStorage.removeItem(AI_ASKED_KEY + userId);
  } catch {}
}
