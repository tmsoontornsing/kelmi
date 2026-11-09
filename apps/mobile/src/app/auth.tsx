import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import Ionicons from '@expo/vector-icons/Ionicons';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, ProviderButton, TextButton } from '../components/Buttons';
import { EmailAuthForm } from '../components/EmailAuthForm';
import { Mascot } from '../components/Mascot';
import { useT } from '../i18n';
import { markConsentPending } from '../lib/consent';
import { PLUS_ENABLED } from '../lib/flags';
import { animateLayout, haptic } from '../motion';
import { modalEdges, resetTo } from '../navigation';
import { useApp } from '../state/AppState';
import { space, useTheme } from '../theme';

// Sign up or sign in, as a sheet over Save Your Plan. Closing it leaves the plan answers where they are.
export default function Auth() {
  const c = useTheme();
  const app = useApp();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t } = useT();

  const [emailOpen, setEmailOpen] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New accounts see the paywall once, over their first week; someone returning to an existing account goes straight in.
  // resetTo closes this sheet along with the rest of onboarding.
  const enter = () => {
    resetTo('/week');
    if (PLUS_ENABLED && from !== 'welcome') router.push('/paywall');
  };

  // Nothing is pre-ticked: the person agrees on purpose, and the time and version are saved with their account.
  const needAgreement = () => {
    if (agreed) return false;
    haptic.error();
    setError(t('Agree to the Terms of Service and Privacy Policy to continue.'));
    return true;
  };

  const withProvider = async (provider: 'apple' | 'google') => {
    if (needAgreement()) return;
    await markConsentPending();
    setBusy(true);
    setError(null);
    try {
      if (await app.signInWithProvider(provider)) enter();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const withEmail = async (mode: 'signup' | 'signin', email: string, password: string) => {
    if (!agreed) throw new Error(t('Agree to the Terms of Service and Privacy Policy to continue.'));
    await markConsentPending();
    if (mode === 'signin') {
      await app.signInWithEmail(email, password);
      enter();
      return 'signed-in' as const;
    }
    const result = await app.signUpWithEmail(email, password);
    if (result === 'signed-in') enter();
    return result;
  };

  const toggleEmail = (open: boolean) => {
    animateLayout();
    setError(null);
    setEmailOpen(open);
  };

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <IconButton icon="close" label={t('Close, sign in later')} onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Mascot pose="save" size={emailOpen ? 84 : 120} tappable label={t('Pip, Kelmi\'s jar, holding a coin')} />
          <View style={styles.copy}>
            <AppText variant="largeTitle" accessibilityRole="header" style={styles.center}>
              {t('Save Your Plan')}
            </AppText>
            <AppText color={c.muted} style={styles.center}>
              {t('Sign in with Apple, Google, or your email so your household settings and grocery list are saved to your account.')}
            </AppText>
          </View>

          <View style={styles.actions}>
            {emailOpen ? (
              <EmailAuthForm onSubmit={withEmail} onBack={() => toggleEmail(false)} />
            ) : (
              <>
                <ProviderButton provider="apple" disabled={busy} onPress={() => withProvider('apple')} />
                <ProviderButton provider="google" disabled={busy} onPress={() => withProvider('google')} />
                <TextButton label={t('Use email instead')} onPress={() => toggleEmail(true)} />
              </>
            )}
            {error ? (
              <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.center}>
                {error}
              </AppText>
            ) : null}
          </View>

          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: agreed }}
            accessibilityLabel={t('I agree to the {terms} and {privacy}.').replace('{terms}', t('Terms of Service')).replace('{privacy}', t('Privacy Policy'))}
            onPress={() => {
              haptic.select();
              setError(null);
              setAgreed((a) => !a);
            }}
            hitSlop={6}
            style={styles.agree}
          >
            <Ionicons name={agreed ? 'checkbox' : 'square-outline'} size={26} color={agreed ? c.primary : c.muted} />
            <AppText variant="footnote" style={styles.agreeText}>
              {/* One sentence with the two links as placeholders, so each language can put them where its grammar needs. */}
              {t('I agree to the {terms} and {privacy}.')
                .split(/(\{terms\}|\{privacy\})/)
                .map((part, i) =>
                  part === '{terms}' ? (
                    <AppText key={i} variant="footnote" weight="600" color={c.primaryText} style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/terms')}>
                      {t('Terms of Service')}
                    </AppText>
                  ) : part === '{privacy}' ? (
                    <AppText key={i} variant="footnote" weight="600" color={c.primaryText} style={styles.link} accessibilityRole="link" onPress={() => router.push('/legal/privacy')}>
                      {t('Privacy Policy')}
                    </AppText>
                  ) : (
                    part
                  ),
                )}
            </AppText>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 8 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 24, alignItems: 'center', gap: 18 },
  copy: { gap: 8, alignSelf: 'stretch' },
  center: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: 10 },
  agree: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  agreeText: { flex: 1 },
  link: { textDecorationLine: 'underline' },
});
