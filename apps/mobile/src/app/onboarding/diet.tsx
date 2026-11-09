import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card, PrimaryButton } from '../../components/Buttons';
import { RadioDot } from '../../components/Controls';
import { OnboardingShell } from '../../components/OnboardingShell';
import { goToStep } from '../../components/StepHeader';
import { dietAllowsMeat, DIETS, GOALS, MEAT_LEVELS, type DietId, type GoalId, type MeatLevelId } from '../../data/mock';
import { useT } from '../../i18n';
import { useApp } from '../../state/AppState';
import { useTheme } from '../../theme';

type Option = { id: string; name: string; detail: string };

// A card of radio rows, like the diet list.
function Choices({ label, options, value, onPick }: { label: string; options: readonly Option[]; value: string; onPick: (id: string) => void }) {
  const c = useTheme();
  const { tx } = useT();
  return (
    <Card style={styles.list}>
      <View accessibilityRole="radiogroup" accessibilityLabel={label}>
        {options.map((o, i) => {
          const on = value === o.id;
          return (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => onPick(o.id)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
                { opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <View style={styles.text}>
                <AppText variant="headline">{tx(o.name)}</AppText>
                <AppText variant="subhead">{tx(o.detail)}</AppText>
              </View>
              <RadioDot on={on} />
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

export default function Diet() {
  const { diet, setDiet, goal, setGoal, meatLevel, setMeatLevel } = useApp();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const { t } = useT();

  return (
    <OnboardingShell
      step={1}
      pip="think"
      backLabel={edit ? t('Back to Settings') : t('Back to welcome')}
      title={t('How Does Your Household Eat?')}
      intro={t('Pick the one that fits most meals. You can change it later in Settings.')}
      footer={
        <PrimaryButton
          label={edit ? t('Done') : t('Continue')}
          onPress={() => (edit ? router.back() : goToStep(1, 2))}
        />
      }
    >
      <Choices label={t('Diet')} options={DIETS} value={diet} onPick={(id) => setDiet(id as DietId)} />

      <View style={styles.group}>
        <AppText variant="eyebrow" accessibilityRole="header">{t('Your goal')}</AppText>
        <Choices label={t('Goal')} options={GOALS} value={goal} onPick={(id) => setGoal(id as GoalId)} />
      </View>

      {dietAllowsMeat(diet) ? (
        <View style={styles.group}>
          <AppText variant="eyebrow" accessibilityRole="header">{t('How much meat do you like?')}</AppText>
          <Choices label={t('Meat')} options={MEAT_LEVELS} value={meatLevel} onPick={(id) => setMeatLevel(id as MeatLevelId)} />
        </View>
      ) : null}
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  list: { overflow: 'hidden' },
  group: { gap: 8 },
  row: { minHeight: 64, paddingHorizontal: 16, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 },
  text: { flex: 1, gap: 2 },
});
