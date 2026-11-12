import AsyncStorage from '@react-native-async-storage/async-storage';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Buttons';
import { Mascot } from '../components/Mascot';
import { useT } from '../i18n';
import { PLUS_ENABLED } from '../lib/flags';
import { parseAuthCallback } from '../lib/safeRoute';
import { supabase } from '../lib/supabase';
import { resetTo } from '../navigation';
import { space, useTheme } from '../theme';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Written by markConsentPending() in lib/consent.ts just before sign-up, and cleared once signed in. A token hash is only
// accepted while it is set and recent, so a link someone else sends can't sign this phone into their account.
const PENDING_SIGN_IN_KEY = 'kavi.consent.pending';
const PENDING_MAX_AGE_MS = 2 * 24 * 60 * 60 * 1000;
async function startedSignUpHere(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_SIGN_IN_KEY);
    const at = raw ? Date.parse((JSON.parse(raw) as { at?: string }).at ?? '') : NaN;
    return Number.isFinite(at) && Date.now() - at < PENDING_MAX_AGE_MS;
  } catch {
    return false;
  }
}

// Where kelmi://auth-callback lands: the link in the confirmation email (a one-time code, or a token hash and its type),
// and on Android a second copy of the Apple or Google browser sign-in, which the sign-in sheet finishes on its own.
// Nothing from the link is shown on screen; a failure gets one plain message and a way back to signing in.
export default function AuthCallback() {
  const c = useTheme();
  const { t } = useT();
  const params = useLocalSearchParams();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const link = parseAuthCallback(params);

    // Already signed in by the time this opened: the sign-in sheet that started it carries on, so just step aside.
    const stepAside = () => (router.canGoBack() ? router.back() : resetTo('/week'));
    // A new session from this link, such as a confirmed email: into the app, as a fresh sign-up would go.
    const enter = () => {
      resetTo('/week');
      if (PLUS_ENABLED) router.push('/paywall');
    };

    (async () => {
      if (!supabase || link.kind === 'error') return setFailed(true);
      const signedIn = async () => !!(await supabase!.auth.getSession()).data.session;

      if (link.kind === 'empty') return (await signedIn()) ? stepAside() : setFailed(true);

      if (link.kind === 'code') {
        if (await signedIn()) return stepAside();
        const { error } = await supabase.auth.exchangeCodeForSession(link.code);
        if (!error) return enter();
        // The sign-in sheet may have used this same code a moment earlier.
        await wait(1200);
        return (await signedIn()) ? stepAside() : setFailed(true);
      }

      // A token hash works on any phone, so it never replaces a session and only finishes a sign-up begun on this phone.
      if (await signedIn()) return stepAside();
      if (!(await startedSignUpHere())) return setFailed(true);
      const { error } = await supabase.auth.verifyOtp({ token_hash: link.tokenHash, type: link.type });
      if (error) return setFailed(true);
      enter();
    })().catch(() => setFailed(true));
    // Runs once, for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const backToSignIn = () => {
    resetTo('/welcome');
    router.push({ pathname: '/auth', params: { from: 'welcome' } });
  };

  if (!failed) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Mascot pose="think" size={110} decorative />
          <ActivityIndicator color={c.primary} />
          <AppText variant="subhead" color={c.muted} style={styles.text}>
            {t('Signing you in…')}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.center}>
        <Mascot pose="oops" size={120} decorative />
        <AppText variant="largeTitle" accessibilityRole="header" style={styles.text}>
          {t('That link didn’t work')}
        </AppText>
        <AppText color={c.muted} style={styles.text}>
          {t('It may have expired or already been used, or it was opened on a different phone. Sign in to carry on.')}
        </AppText>
      </View>
      <View style={styles.footer}>
        <PrimaryButton label={t('Back to Sign In')} onPress={backToSignIn} />
        <TextButton label={t('Not now')} onPress={() => resetTo('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  text: { textAlign: 'center' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 12, gap: 4 },
});
