import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { BuildingPip } from '../components/BuildingPip';
import { Card, PrimaryButton, TextButton } from '../components/Buttons';
import { KelmiSwitch } from '../components/Controls';
import { DAYS, MEAL_LABELS } from '../data/mock';
import { useT } from '../i18n';
import { haptic } from '../motion';
import { modalEdges } from '../navigation';
import { useApp } from '../state/AppState';
import { radius, space, useTheme } from '../theme';

// Choose which meals to buy for, then build the grocery list from just those. A meal that breaks the household's allergies
// or diet is shown off and locked, with a way to swap it. Presented as a page sheet: swipe down to leave without changes.
export default function PlanGroceries() {
  const c = useTheme();
  const app = useApp();
  const { t, tn, tx } = useT();

  // Everything starts ticked except what was skipped before or conflicts, so a second visit remembers the last choice.
  const [shop, setShop] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(app.plan.map((m) => [m.slot, m.status !== 'skip' && !m.conflict])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const choosable = app.plan.filter((m) => !m.conflict);
  const count = choosable.filter((m) => shop[m.slot]).length;
  const setAll = (on: boolean) => {
    haptic.select();
    setShop(Object.fromEntries(app.plan.map((m) => [m.slot, on && !m.conflict])));
  };

  const generate = async () => {
    if (busy || count === 0) return;
    setBusy(true);
    setError(null);
    try {
      const conflicts = await app.generateGroceries(app.plan.map((m) => ({ slot: m.slot, shop: !!shop[m.slot] && !m.conflict })));
      router.back();
      if (conflicts.length > 0) {
        // The list is built; this says why some meals are not on it.
        setTimeout(
          () =>
            Alert.alert(
              t('Some meals were left off'),
              tn(
                conflicts.length,
                '{n} meal doesn’t fit your allergies or diet, so it isn’t on your list. Swap it from This Week.',
                '{n} meals don’t fit your allergies or diet, so they aren’t on your list. Swap them from This Week.',
              ),
            ),
          400,
        );
      }
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const days = Array.from({ length: 7 }, (_, d) => app.plan.filter((m) => Math.floor(m.slot / 3) === d));

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.flex}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} scrollEnabled={!busy}>
        <View style={styles.head}>
          <AppText variant="largeTitle" accessibilityRole="header">{t('Plan your shopping')}</AppText>
          <AppText color={c.muted}>{t('Untick the meals you won’t cook, like nights eating out. Kelmi buys only for the rest, and checks each one against your allergies and diet.')}</AppText>
          <View style={styles.bulk}>
            <TextButton label={t('Select all')} onPress={() => setAll(true)} />
            <TextButton label={t('Clear')} onPress={() => setAll(false)} color={c.muted} />
          </View>
        </View>

        {days.map((meals, d) =>
          meals.length === 0 ? null : (
            <Card key={d} style={styles.day}>
              <AppText variant="headline" accessibilityRole="header">{tx(DAYS[d][1])}</AppText>
              {meals.map((m, i) => (
                <View key={m.slot} style={[styles.row, i > 0 && { borderTopColor: c.line, borderTopWidth: StyleSheet.hairlineWidth }]}>
                  <View style={styles.flex}>
                    <AppText variant="footnote" weight="600">{tx(MEAL_LABELS[m.type])}</AppText>
                    <AppText style={m.conflict ? { color: c.muted } : undefined}>{m.name}</AppText>
                    {m.conflict ? (
                      <View style={styles.badgeRow}>
                        <AppText variant="footnote" weight="600" color={c.warn}>{t('Doesn’t fit your allergies or diet')}</AppText>
                        <TextButton
                          label={t('Swap')}
                          onPress={() => router.push({ pathname: '/swap/[slot]', params: { slot: String(m.slot) } })}
                        />
                      </View>
                    ) : m.status === 'leftover' ? (
                      <AppText variant="footnote" weight="600" color={c.primaryText}>{t('Eating leftovers')}</AppText>
                    ) : null}
                  </View>
                  <KelmiSwitch
                    value={!!shop[m.slot] && !m.conflict}
                    onValueChange={(on) => {
                      if (m.conflict) return;
                      haptic.select();
                      setShop((s) => ({ ...s, [m.slot]: on }));
                    }}
                    label={t('Buy for {meal} on {day}', { meal: m.name, day: tx(DAYS[d][1]) })}
                  />
                </View>
              ))}
            </Card>
          ),
        )}

        <AppText variant="footnote" style={styles.note}>
          {t('Kelmi leaves out recipes tagged with these allergens, but tags can be wrong and products vary by brand. Always read labels, and check every ingredient yourself if an allergy is severe.')}
        </AppText>
        {error ? (
          <AppText variant="subhead" color={c.warn} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</AppText>
        ) : null}
      </ScrollView>
      {busy ? <BuildingPip /> : null}
      </View>

      <View style={[styles.footer, { backgroundColor: c.bg, borderTopColor: c.line }]}>
        <PrimaryButton
          label={busy ? t('Building your list…') : count === 0 ? t('Pick at least one meal') : tn(count, 'Generate Grocery List · {n} meal', 'Generate Grocery List · {n} meals')}
          onPress={generate}
          feedback="none"
          loading={busy}
        />
        <TextButton label={t('Cancel')} onPress={() => router.back()} color={c.muted} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  content: { paddingHorizontal: space.gutter, paddingTop: 20, paddingBottom: 24, gap: 12 },
  head: { gap: 8 },
  bulk: { flexDirection: 'row', gap: 20 },
  day: { padding: 14, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  note: { paddingHorizontal: 4 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 8, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
});
