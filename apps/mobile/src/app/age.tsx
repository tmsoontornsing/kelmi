import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, PrimaryButton } from '../components/Buttons';
import { BirthDatePicker, type BirthDate } from '../components/BirthDatePicker';
import { Mascot } from '../components/Mascot';
import { useT } from '../i18n';
import * as api from '../lib/api';
import { getAgeStatus, meetsMinimumAge, setAgeStatus, type AgeStatus } from '../lib/consent';
import { safeAgeNext } from '../lib/safeRoute';
import { haptic } from '../motion';
import { useApp } from '../state/AppState';
import { radius, space, useTheme } from '../theme';

// A neutral age check before anything else: a calendar with nothing pre-selected. The birth date is used once to decide
// and is never saved; only the result is, so an under-13 answer sticks on this phone. Someone already signed in (sent here
// by the server asking for their age) also has the answer recorded on their account.
export default function Age() {
  const c = useTheme();
  const { t } = useT();
  const app = useApp();
  // Only the places the app itself sends people next; a deep link can't pick somewhere else.
  const next = safeAgeNext(useLocalSearchParams<{ next?: string }>().next);

  const [status, setStatus] = useState<AgeStatus | 'loading'>('loading');
  const [birth, setBirth] = useState<BirthDate | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getAgeStatus().then((s) => {
      if (s === 'ok') router.replace(next as never);
      else setStatus(s);
    });
  }, [next]);

  const submit = async () => {
    if (!birth) {
      setError(t('Choose your birth date.'));
      return;
    }
    if (meetsMinimumAge(birth)) {
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
      <ScrollView style={styles.flex} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.copy}>
            <AppText variant="eyebrow" color={c.primaryText}>
              {t('Before we start')}
            </AppText>
            <AppText variant="largeTitle" accessibilityRole="header">
              {t('When were you born?')}
            </AppText>
          </View>
          <Mascot pose="think" size={92} decorative />
        </View>

        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
          <BirthDatePicker
            onChange={(d) => {
              setError(null);
              setBirth(d);
            }}
          />
        </View>

        {error ? (
          <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">
            {error}
          </AppText>
        ) : null}

        <View style={styles.privacy}>
          <Ionicons name="lock-closed-outline" size={18} color={c.muted} style={styles.lock} />
          <AppText variant="footnote" style={styles.flex}>
            {t('Kelmi is for people 13 and older. We only use this to check your age, and we don’t save your birth date.')}
          </AppText>
        </View>
      </ScrollView>
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
  content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 16, gap: 16 },
  hero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  copy: { flex: 1, gap: 6 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: 16, gap: 10 },
  privacy: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingHorizontal: 4 },
  lock: { marginTop: 1 },
  footer: { paddingHorizontal: space.gutter, paddingBottom: 12 },
  blocked: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, paddingHorizontal: 32 },
  center: { textAlign: 'center' },
});
