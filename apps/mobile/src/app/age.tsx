import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, PrimaryButton } from '../components/Buttons';
import { Mascot } from '../components/Mascot';
import { useLanguage, useT } from '../i18n';
import * as api from '../lib/api';
import { getAgeStatus, meetsMinimumAge, setAgeStatus, type AgeStatus } from '../lib/consent';
import { haptic } from '../motion';
import { useApp } from '../state/AppState';
import { fonts, radius, space, useTheme } from '../theme';

// A neutral age check before anything else: month and year, nothing pre-selected. The birth date is used once to decide
// and is never saved; only the result is, so an under-13 answer sticks on this phone. Someone already signed in (sent here
// by the server asking for their age) also has the answer recorded on their account.
export default function Age() {
  const c = useTheme();
  const { t } = useT();
  const { lang } = useLanguage();
  const app = useApp();
  const { next = '/onboarding/diet' } = useLocalSearchParams<{ next?: string }>();

  const [status, setStatus] = useState<AgeStatus | 'loading'>('loading');
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgeStatus().then((s) => {
      if (s === 'ok') router.replace(next as never);
      else setStatus(s);
    });
  }, [next]);

  const months = Array.from({ length: 12 }, (_, i) => {
    try {
      return new Date(2000, i, 1).toLocaleDateString(lang, { month: 'short' });
    } catch {
      return String(i + 1);
    }
  });

  const submit = async () => {
    const y = Number(year);
    const now = new Date().getFullYear();
    if (month === null || !/^\d{4}$/.test(year) || y < now - 110 || y > now) {
      setError(t('Choose your birth month and enter a four-digit year.'));
      return;
    }
    if (meetsMinimumAge(month, y)) {
      await setAgeStatus('ok');
      // Signed in already: tell the server now. Otherwise it is recorded right after sign-up or sign-in.
      if (app.signedIn) await api.recordConsent('age').catch(() => {});
      router.replace(next as never);
    } else {
      haptic.select();
      await setAgeStatus('blocked');
      setStatus('blocked');
    }
  };

  if (status === 'loading') return <View style={[styles.root, { backgroundColor: c.bg }]} />;

  if (status === 'blocked') {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        <View style={styles.blocked}>
          <Mascot pose="sleep" size={120} decorative />
          <AppText variant="largeTitle" accessibilityRole="header" style={styles.center}>
            {t('Kelmi isn’t available for people under 13')}
          </AppText>
          <AppText color={c.muted} style={styles.center}>
            {t('Thanks for being honest. Kelmi is for people 13 and older, so it can’t be used by anyone under 13.')}
          </AppText>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <IconButton icon="chevron-back" label={t('Back')} onPress={() => router.back()} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.copy}>
            <AppText variant="largeTitle" accessibilityRole="header">
              {t('When were you born?')}
            </AppText>
            <AppText color={c.muted}>{t('Kelmi is for people 13 and older. We only use this to check your age, and we don’t save your birth date.')}</AppText>
          </View>

          <View style={styles.group}>
            <AppText variant="headline" accessibilityRole="header">
              {t('Birth month')}
            </AppText>
            <View style={styles.months}>
              {months.map((name, i) => {
                const on = month === i + 1;
                return (
                  <Pressable
                    key={name + i}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => {
                      haptic.select();
                      setError(null);
                      setMonth(i + 1);
                    }}
                    style={[styles.month, { backgroundColor: on ? c.primary : c.card, borderColor: on ? c.primary : c.line }]}
                  >
                    <AppText weight="600" color={on ? c.onPrimary : c.text}>
                      {name}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.group}>
            <AppText variant="headline" accessibilityRole="header">
              {t('Birth year')}
            </AppText>
            <TextInput
              accessibilityLabel={t('Birth year')}
              keyboardType="number-pad"
              maxLength={4}
              placeholder={t('Year')}
              placeholderTextColor={c.muted}
              value={year}
              onChangeText={(v) => {
                setError(null);
                setYear(v.replace(/\D/g, ''));
              }}
              onSubmitEditing={submit}
              style={[styles.input, { backgroundColor: c.card, color: c.text, borderColor: c.line }]}
            />
          </View>

          {error ? (
            <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">
              {error}
            </AppText>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      <View style={styles.footer}>
        <PrimaryButton label={t('Continue')} onPress={submit} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 8 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 24 },
  copy: { gap: 8 },
  group: { gap: 10 },
  months: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  month: { minWidth: 72, minHeight: 44, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1 },
  input: { minHeight: 52, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: 16, fontFamily: fonts.regular, fontSize: 20 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 12 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  center: { textAlign: 'center' },
});
