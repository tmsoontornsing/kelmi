import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card, PrimaryButton } from '../../components/Buttons';
import { CheckCircle } from '../../components/Controls';
import { OnboardingShell } from '../../components/OnboardingShell';
import { goToStep } from '../../components/StepHeader';
import { APPLIANCES } from '../../data/mock';
import { useT } from '../../i18n';
import { haptic, PressableScale } from '../../motion';
import { useApp } from '../../state/AppState';
import { useTheme } from '../../theme';

export default function Kitchen() {
  const c = useTheme();
  const { appliances, toggleAppliance } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { t, tn, tx } = useT();

  return (
    <OnboardingShell
      step={3}
      pip="cook"
      backLabel={edit ? t('Back to Settings') : t('Back to step 2')}
      title={t('What’s in Your Kitchen?')}
      intro={t('Tick what you have. Kelmi only plans meals you can cook with it.')}
      footer={
        <PrimaryButton
          label={edit ? t('Done') : t('Continue')}
          onPress={() => (edit ? router.back() : goToStep(3, 4))}
        />
      }
    >
      <Card style={styles.list}>
        <View accessibilityRole="list" accessibilityLabel={t('Kitchen appliances')}>
          {APPLIANCES.map((a, i) => {
            const on = appliances.includes(a.id);
            return (
              <PressableScale
                key={a.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={tx(a.name)}
                to={0.98}
                onPress={() => {
                  haptic.tap();
                  toggleAppliance(a.id);
                }}
                style={({ pressed }) => [
                  styles.row,
                  i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
                  { opacity: pressed ? 0.7 : 1 },
                ]}
              >
                <CheckCircle on={on} />
                <View style={styles.text}>
                  <AppText variant="headline">{tx(a.name)}</AppText>
                  {a.detail ? <AppText variant="subhead">{tx(a.detail)}</AppText> : null}
                </View>
              </PressableScale>
            );
          })}
        </View>
      </Card>
      <AppText variant="footnote" accessibilityLiveRegion="polite">
        {appliances.length === 0
          ? t('Nothing ticked means Kelmi won’t plan around your equipment. You can change this any time in Settings.')
          : tn(
              appliances.length,
              '{n} ticked. You can change this any time in Settings.',
              '{n} ticked. You can change this any time in Settings.',
            )}
      </AppText>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden' },
  row: { minHeight: 56, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 14 },
  text: { flex: 1, gap: 1 },
});
