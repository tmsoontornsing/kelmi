import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Buttons';
import { Mascot } from '../components/Mascot';
import { useT } from '../i18n';
import { updatePassword } from '../lib/api';
import { parseAuthCallback } from '../lib/safeRoute';
import { supabase } from '../lib/supabase';
import { haptic } from '../motion';
import { resetTo } from '../navigation';
import { fonts, radius, space, useTheme } from '../theme';

const MIN_LENGTH = 8;

// Where kelmi://reset-password lands: the link in the "reset your password" email. It carries a one-time code that only
// the phone that asked for the reset can use, so this screen never accepts a token hash. The code signs the person in, and
// then they choose a new password. A link that fails gets one plain message and a way back to signing in.
export default function ResetPassword() {
  const c = useTheme();
  const { t } = useT();
  const params = useLocalSearchParams();
  const [stage, setStage] = useState<'working' | 'form' | 'failed'>('working');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      const link = parseAuthCallback(params);
      if (!supabase || link.kind !== 'code') return setStage('failed');
      const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(link.code);
      setStage(exchangeError ? 'failed' : 'form');
    })().catch(() => setStage('failed'));
    // Runs once, for the link that opened this screen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = async () => {
    if (busy) return;
    if (password.length < MIN_LENGTH) {
      haptic.error();
      return setError(t('Use at least {n} characters for the password.', { n: MIN_LENGTH }));
    }
    setBusy(true);
    setError(null);
    try {
      await updatePassword(password);
      haptic.success();
      resetTo('/week');
    } catch (e) {
      haptic.error();
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const backToSignIn = () => {
    resetTo('/welcome');
    router.push({ pathname: '/auth', params: { from: 'welcome' } });
  };

  if (stage === 'working') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.center} accessibilityLiveRegion="polite">
          <Mascot pose="think" size={110} decorative />
          <ActivityIndicator color={c.primary} />
          <AppText variant="subhead" color={c.muted} style={styles.text}>
            {t('Checking your link…')}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  if (stage === 'failed') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.center}>
          <Mascot pose="oops" size={120} decorative />
          <AppText variant="largeTitle" accessibilityRole="header" style={styles.text}>
            {t('That link didn’t work')}
          </AppText>
          <AppText color={c.muted} style={styles.text}>
            {t('It may have expired or already been used, or it was opened on a different phone. Ask for a new link from the sign-in page.')}
          </AppText>
        </View>
        <View style={styles.footer}>
          <PrimaryButton label={t('Back to Sign In')} onPress={backToSignIn} />
          <TextButton label={t('Not now')} onPress={() => resetTo('/')} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <Mascot pose="wave" size={110} tappable decorative />
          </View>
          <AppText variant="eyebrow" color={c.primaryText}>
            {t('Almost there')}
          </AppText>
          <AppText variant="largeTitle" accessibilityRole="header">
            {t('Choose a new password')}
          </AppText>
          <AppText color={c.muted}>{t('You are signed in. Pick a password to use next time.')}</AppText>

          <View>
            <TextInput
              accessibilityLabel={t('New password')}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              secureTextEntry={!show}
              returnKeyType="go"
              placeholder={t('New password')}
              placeholderTextColor={c.muted}
              value={password}
              onChangeText={setPassword}
              onSubmitEditing={save}
              style={[styles.input, { backgroundColor: c.card, color: c.text, borderColor: c.control }]}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={show ? t('Hide password') : t('Show password')}
              hitSlop={8}
              onPress={() => {
                haptic.select();
                setShow((s) => !s);
              }}
              style={styles.eye}
            >
              <Ionicons name={show ? 'eye-off-outline' : 'eye-outline'} size={22} color={c.muted} />
            </Pressable>
          </View>

          {error ? (
            <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <PrimaryButton label={t('Save new password')} loading={busy} onPress={save} />
          <TextButton label={t('Skip for now')} onPress={() => resetTo('/week')} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.gutter, paddingTop: 24, gap: 12 },
  hero: { alignItems: 'center', marginBottom: 4 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  text: { textAlign: 'center' },
  input: { minHeight: 52, borderWidth: 1.5, borderRadius: radius.control, paddingHorizontal: 14, paddingRight: 48, fontSize: 17, fontFamily: fonts.regular },
  eye: { position: 'absolute', right: 14, top: 0, bottom: 0, justifyContent: 'center' },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 12, gap: 4 },
});
