import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card, PrimaryButton } from '../../components/Buttons';
import { KelmiSwitch } from '../../components/Controls';
import { OnboardingShell } from '../../components/OnboardingShell';
import { applianceName, dietAllowsMeat, DIETS, GOALS, MEAT_LEVELS } from '../../data/mock';
import { comma, useT } from '../../i18n';
import { PLUS_ENABLED } from '../../lib/flags';
import { resetTo } from '../../navigation';
import { useApp } from '../../state/AppState';
import { useTheme } from '../../theme';

export default function Save() {
  const c = useTheme();
  const app = useApp();
  const { from } = useLocalSearchParams<{ from?: string }>();
  const { t, tx } = useT();
  const dietName = tx(DIETS.find((d) => d.id === app.diet)?.name ?? 'Everything');
  const avoiding = app.allergies.length ? app.allergies.map(tx).join(comma()) : t('Nothing');
  const kitchen = app.appliances.length ? app.appliances.map((a) => tx(applianceName(a))).join(comma()) : t('Nothing yet');

  // New accounts see the paywall once, over their first week; someone returning to an existing account goes straight in.
  const enter = () => {
    resetTo('/week');
    if (PLUS_ENABLED && from !== 'welcome') router.push('/paywall');
  };

  // Nobody signed in: the sign-up and sign-in sheet opens on its own the first time this step appears.
  // Closing it leaves the button below to open it again.
  const openAuth = () => router.push({ pathname: '/auth', params: { from } });
  const asked = useRef(false);
  useEffect(() => {
    if (!app.live || !app.authReady || app.signedIn || asked.current) return;
    asked.current = true;
    openAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.live, app.authReady, app.signedIn]);

  const summary: [string, string][] = [
    [t('People'), String(app.people)],
    [t('Diet'), dietName],
    [t('Goal'), tx(GOALS.find((g) => g.id === app.goal)?.name ?? 'Just eat well')],
    ...(dietAllowsMeat(app.diet) ? [[t('Meat'), tx(MEAT_LEVELS.find((m) => m.id === app.meatLevel)?.name ?? 'Some')] as [string, string]] : []),
    [t('Weekly budget'), `$${app.budget}`],
    [t('Avoiding'), avoiding],
    [t('Kitchen'), kitchen],
  ];

  return (
    <OnboardingShell
      step={4}
      pip="save"
      backLabel={from === 'welcome' ? t('Back to welcome') : t('Back to step 3')}
      title={t('Save Your Plan')}
      intro={
        app.live
          ? t('Check your answers, then save them to an account. You can change any of this later in Settings.')
          : t('This build runs on example data, so nothing is saved yet.')
      }
      footer={
        <>
          {!app.live ? (
            <PrimaryButton
              label={t('Continue')}
              onPress={() => {
                app.signIn();
                enter();
              }}
            />
          ) : app.signedIn ? (
            <PrimaryButton label={t('Continue')} onPress={enter} />
          ) : (
            <PrimaryButton label={t('Sign Up or Log In')} onPress={openAuth} />
          )}
          <AppText variant="footnote" style={styles.center}>
            {t('Kelmi uses your account only to save your settings and sync your list.')}
          </AppText>
        </>
      }
    >
      <Card style={styles.summary}>
        {summary.map(([k, v], i) => (
          <View
            key={k}
            style={[styles.summaryRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
          >
            <AppText>{k}</AppText>
            <AppText color={c.muted} style={styles.value} numberOfLines={2}>{v}</AppText>
          </View>
        ))}
      </Card>

      <Card style={styles.remind}>
        <View style={styles.flex}>
          <AppText variant="headline">{t('Sunday reminder')}</AppText>
          <AppText variant="subhead">
            {t('A note at 5 PM when next week’s plan is ready. iOS asks for permission when you turn this on.')}
          </AppText>
        </View>
        <KelmiSwitch label={t('Sunday reminder')} value={app.remindSunday} onValueChange={app.setRemindSunday} />
      </Card>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 2 },
  summary: { paddingHorizontal: 16, paddingVertical: 4 },
  summaryRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  value: { flexShrink: 1, textAlign: 'right' },
  remind: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  center: { textAlign: 'center', paddingBottom: 4 },
});
