import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText } from '../components/AppText';
import { NoticeScreen } from '../components/NoticeScreen';
import { PrimaryButton, TextButton } from '../components/Buttons';
import { useT } from '../i18n';
import { planAfterNotice } from '../lib/safeRoute';
import { useApp } from '../state/AppState';
import { useTheme } from '../theme';

// The allergy notice and the consent to use allergy, diet and food-note details. Shown once before the first plan, and from
// Settings any time after. Closing it without tapping "I understand and agree" does not start a plan.
export default function AllergyAck() {
  const c = useTheme();
  const app = useApp();
  const { t } = useT();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const done = !!app.consent.allergy;
  // Decided once, when the sheet opens: carry on to a plan only when the app's own "plan my week" step opened this (the
  // notice not yet acknowledged) and not a deep link. Even then nothing runs until "I understand" is tapped.
  const [planAfter] = useState(() => planAfterNotice(then, Linking.getLinkingURL(), 'allergy-ack', app.consent.available && !done));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    if (busy) return;
    if (done) return router.back();
    setBusy(true);
    setError(null);
    try {
      await app.recordConsent('allergy');
      router.back();
      if (planAfter) setTimeout(() => app.generatePlan(), 350);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <NoticeScreen
      pip="peek"
      title={t('A note about allergies')}
      onClose={() => router.back()}
      footer={<PrimaryButton label={done ? t('Done') : t('I understand and agree')} loading={busy} onPress={accept} />}
    >
      <AppText>
        {t('Kelmi’s allergy filter is a helper, not a guarantee. Recipe tags and ingredient lists can be incomplete or wrong. Always read ingredient labels, and check with your doctor if an allergy is serious.')}
      </AppText>
      {/* Explicit consent to use health and religion-revealing details (Thailand's PDPA s.26, Washington's My Health My Data
          Act). It is its own screen, not part of the Terms, and the tap is recorded on the server (allergy_ack_at). */}
      <AppText>
        {t('Kelmi uses the allergies, diet and food notes you give it only to plan your meals and grocery lists. They can reveal health or religious information, so we ask for your consent. Tap “I understand and agree” to give it. You can change or remove them in Settings, or delete your account, at any time.')}
      </AppText>
      <TextButton label={t('Consumer Health Data Policy')} onPress={() => router.push('/legal/health')} />
      {error ? (
        <AppText variant="subhead" color={c.warn} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </NoticeScreen>
  );
}
