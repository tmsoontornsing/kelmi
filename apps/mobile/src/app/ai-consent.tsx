import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { AppText } from '../components/AppText';
import { NoticeScreen } from '../components/NoticeScreen';
import { PrimaryButton, TextButton } from '../components/Buttons';
import { useT } from '../i18n';
import { useApp } from '../state/AppState';
import { useTheme } from '../theme';

// The choice about sending meal-planning details to an AI provider. Shown once before the first plan, and from Settings any
// time after. "Not now" is a real answer: Kelmi plans with its built-in planner and only asks again from Settings.
export default function AiConsent() {
  const c = useTheme();
  const app = useApp();
  const { t } = useT();
  const { then } = useLocalSearchParams<{ then?: string }>();
  const on = !!app.consent.ai;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const finish = () => {
    router.back();
    // The plan the person asked for carries on once the sheet has closed.
    if (then === 'plan') setTimeout(() => app.generatePlan(), 350);
  };

  const run = async (work: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await work();
      finish();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  return (
    <NoticeScreen
      pip="think"
      title={t('AI planning')}
      onClose={() => (on ? router.back() : run(app.skipAiConsent))}
      footer={
        on ? (
          <>
            <PrimaryButton label={t('Done')} onPress={() => router.back()} />
            <TextButton label={t('Turn Off AI Planning')} color={c.danger} onPress={() => run(app.revokeAiConsent)} />
          </>
        ) : (
          <>
            <PrimaryButton label={t('Allow')} loading={busy} onPress={() => run(() => app.recordConsent('ai'))} />
            <TextButton label={t('Not now')} onPress={() => run(app.skipAiConsent)} />
          </>
        )
      }
    >
      <AppText>
        {t('To pick your meals, Kelmi sends your household size, budget, allergies, diet, likes, dislikes and food notes to an AI provider (Anthropic or IDUnify AI). It does not send your name or email. You can say no and Kelmi will use its built-in planner instead.')}
      </AppText>
      <AppText variant="subhead" weight="600" color={on ? c.primaryText : c.muted}>
        {on ? t('AI planning is on.') : t('AI planning is off. Kelmi uses its built-in planner.')}
      </AppText>
      <TextButton label={t('Read the Privacy Policy')} onPress={() => router.push('/legal/privacy')} />
      {error ? (
        <AppText variant="subhead" color={c.warn} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
    </NoticeScreen>
  );
}
