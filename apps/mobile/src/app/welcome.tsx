import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { PrimaryButton, TextButton } from '../components/Buttons';
import { Mascot } from '../components/Mascot';
import { PantryDrift } from '../components/PantryDrift';
import { WeekJar } from '../components/WeekJar';
import { useT } from '../i18n';
import { fonts, useTheme } from '../theme';

export default function Welcome() {
  const c = useTheme();
  const { t } = useT();
  // A sample week for 3 vegetarians on $95: each day's dinner, and what that whole day costs.
  // Memoized per language: WeekJar restarts its animation when `days` changes.
  const example = useMemo(
    () => [
      { day: t('Mon'), meal: t('Chickpea shakshuka'), cost: 12 },
      { day: t('Tue'), meal: t('Peanut noodle bowls'), cost: 11 },
      { day: t('Wed'), meal: t('Stuffed sweet potatoes'), cost: 13 },
      { day: t('Thu'), meal: t('Veggie fried rice'), cost: 10 },
      { day: t('Fri'), meal: t('Black bean quesadillas'), cost: 14 },
      { day: t('Sat'), meal: t('Mushroom risotto'), cost: 12 },
      { day: t('Sun'), meal: t('Lentil shepherd’s pie'), cost: 9 },
    ],
    [t],
  );
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <PantryDrift />
      <ScrollView contentContainerStyle={styles.content}>
        <Mascot pose="wave" size={120} tappable label={t('Pip, Kelmi\'s jar, waving hello')} style={styles.pip} />
        <View style={styles.copy}>
          <AppText style={styles.hero} accessibilityRole="header">
            {t('Every meal of the week, inside your grocery budget.')}
          </AppText>
          <AppText color={c.muted}>
            {t('Tell Kelmi who you cook for and what you spend. It plans the week and builds the grocery list.')}
          </AppText>
        </View>

        <WeekJar
          title={t('Example week · 3 people, vegetarian')}
          days={example}
          budget={95}
          label={t('Example week for 3 vegetarian people. Seven dinners, each day\'s meals adding up to $81 of a $95 budget, $14 to spare.')}
        />
      </ScrollView>

      <View style={styles.footer}>
        <PrimaryButton label={t('Get Started')} onPress={() => router.push({ pathname: '/age', params: { next: '/onboarding/diet' } })} />
        <TextButton label={t('I Already Have an Account')} onPress={() => router.push({ pathname: '/age', params: { next: '/onboarding/save?from=welcome' } })} />
        <AppText variant="footnote" style={styles.center}>
          {t('No account needed until you save your first plan.')}
        </AppText>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { padding: 24, paddingTop: 8, paddingBottom: 16, gap: 22 },
  pip: { marginLeft: -14, marginBottom: -18, marginTop: -8 },
  copy: { gap: 12 },
  hero: { fontFamily: fonts.display, fontSize: 38, lineHeight: 42, letterSpacing: -1 },
  footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8, gap: 4 },
  center: { textAlign: 'center' },
});
