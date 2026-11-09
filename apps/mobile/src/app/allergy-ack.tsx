import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText } from '../components/AppText';
import { NoticeScreen } from '../components/NoticeScreen';
import { PrimaryButton } from '../components/Buttons';
import { useT } from '../i18n';
import { useApp } from '../state/AppState';
import { useTheme } from '../theme';

// The allergy notice. Shown once before the first plan, and from Settings any time after. Closing it without tapping
// "I understand" does not start a plan.
export default function AllergyAck() {
  const c = useTheme();
  const app = useApp();
  const { t } = useT();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const done = !!app.consent.allergy;
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
      if (then === 'plan') setTimeout(() => app.generatePlan(), 350);
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
      footer={<PrimaryButton label={done ? t('Done') : t('I understand')} loading={busy} onPress={accept} />}
    >
      <AppText>
        {t('Kelmi’s allergy filter is a helper, not a guarantee. Recipe tags and ingredient lists can be incomplete or wrong. Always read ingredient labels, and check with your doctor if an allergy is serious.')}
      </AppText>
      {error ? (
        <AppText variant="subhead" color={c.warn} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </NoticeScreen>
  );
}
