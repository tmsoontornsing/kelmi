import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { comma, useT } from '../i18n';
import { labelRound, percentDV, type NutrientKey, type ServingNutrition } from '../lib/nutrition';
import { reduceMotion, useCountUp } from '../motion';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { Card } from './Buttons';
import { PlusNotice } from './PlusLock';

// FDA guidance: 20% of the Daily Value or more in one serving is high. Flagged for the ones to limit.
const LIMIT: NutrientKey[] = ['sat_fat_g', 'cholesterol_mg', 'sodium_mg'];

// Per-serving nutrition for a recipe: calories, where they come from, and the label rows with % Daily Value.
export function NutritionFacts({ nutrition, serves, locked = false }: { nutrition: ServingNutrition; serves: number; locked?: boolean }) {
  const c = useTheme();
  const { t, tn, tx } = useT();
  const n = nutrition.perServing;

  // The label rows, in the order a US Nutrition Facts label lists them. Indented rows are part of the row above.
  const rows: { key: NutrientKey; label: string; unit: 'g' | 'mg'; indent?: boolean }[] = [
    { key: 'fat_g', label: t('Total fat'), unit: 'g' },
    { key: 'sat_fat_g', label: t('Saturated fat'), unit: 'g', indent: true },
    { key: 'cholesterol_mg', label: t('Cholesterol'), unit: 'mg' },
    { key: 'sodium_mg', label: t('Sodium'), unit: 'mg' },
    { key: 'carbs_g', label: t('Total carbs'), unit: 'g' },
    { key: 'fiber_g', label: t('Fiber'), unit: 'g', indent: true },
    { key: 'sugar_g', label: t('Total sugars'), unit: 'g', indent: true },
    { key: 'protein_g', label: t('Protein'), unit: 'g' },
  ];
  const kcal = Math.round(useCountUp(labelRound('kcal', n.kcal)));

  // Share of calories from each macro, at 4 kcal per gram of protein and carbs and 9 per gram of fat.
  const parts = [
    { id: 'protein', label: t('Protein'), kcal: n.protein_g * 4, color: c.primary },
    { id: 'carbs', label: t('Carbs'), kcal: n.carbs_g * 4, color: c.badge },
    { id: 'fat', label: t('Fat'), kcal: n.fat_g * 9, color: c.control },
  ];
  const sum = parts.reduce((s, p) => s + p.kcal, 0) || 1;
  const share = (kcal: number) => Math.round((kcal / sum) * 100);

  return (
    <Card style={styles.card}>
      <View style={styles.head} accessible accessibilityLabel={t('{n} calories per serving', { n: labelRound('kcal', n.kcal) })}>
        <AppText style={[styles.kcal, { color: c.text }]}>{kcal}</AppText>
        <AppText variant="subhead">{t('calories per serving')}</AppText>
      </View>

      {locked ? (
        <PlusNotice text={t('Protein, carbs, fat, sodium and % Daily Value are part of Kelmi Plus.')} />
      ) : (
        <>
      <View
        accessible
        accessibilityLabel={t('Calories from protein {protein}%, carbs {carbs}%, fat {fat}%', {
          protein: share(parts[0].kcal),
          carbs: share(parts[1].kcal),
          fat: share(parts[2].kcal),
        })}
        style={styles.split}
      >
        <View style={[styles.bar, { backgroundColor: c.track }]}>
          {parts.map((p, i) => (
            <Segment key={p.id} share={p.kcal / sum} color={p.color} index={i} />
          ))}
        </View>
        <View style={styles.legend}>
          {parts.map((p) => (
            <View key={p.id} style={styles.legendItem}>
              <View style={[styles.dot, { backgroundColor: p.color }]} />
              <AppText variant="footnote" color={c.text}>
                {t('{name} {pct}%', { name: p.label, pct: share(p.kcal) })}
              </AppText>
            </View>
          ))}
        </View>
      </View>

      <View>
        <View style={[styles.row, styles.rowHead, { borderBottomColor: c.text }]}>
          <AppText variant="footnote" weight="600" color={c.text} style={styles.flex}>{t('Amount per serving')}</AppText>
          <AppText variant="footnote" weight="600" color={c.text}>{t('% Daily Value')}</AppText>
        </View>
        {rows.map((r, i) => {
          const amount = labelRound(r.key, n[r.key]);
          const pct = percentDV(r.key, n[r.key]);
          const high = pct !== null && pct >= 20 && LIMIT.includes(r.key);
          const said = { name: r.label, amount, unit: r.unit === 'g' ? t('grams') : t('milligrams'), pct: pct ?? 0 };
          return (
            <View
              key={r.key}
              accessible
              accessibilityLabel={
                pct === null
                  ? t('{name}, {amount} {unit}', said)
                  : high
                    ? t('{name}, {amount} {unit}, {pct}% of daily value, high', said)
                    : t('{name}, {amount} {unit}, {pct}% of daily value', said)
              }
              style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <AppText
                variant="subhead"
                color={c.text}
                weight={r.indent ? undefined : '600'}
                style={[styles.flex, r.indent && styles.indent]}
              >
                {r.label}
                <AppText variant="subhead" color={c.muted}>{`  ${r.unit === 'g' ? t('{n} g', { n: amount }) : t('{n} mg', { n: amount })}`}</AppText>
              </AppText>
              {pct !== null ? (
                <AppText variant="subhead" weight="600" color={high ? c.warn : c.text} style={styles.nums}>
                  {`${pct}%`}
                </AppText>
              ) : null}
            </View>
          );
        })}
      </View>

        </>
      )}

      <AppText variant="footnote">
        {tn(
          serves,
          'Estimated from the ingredients, for one of {n} serving. % Daily Value is based on 2,000 calories a day. A guide, not medical advice.',
          'Estimated from the ingredients, for one of {n} servings. % Daily Value is based on 2,000 calories a day. A guide, not medical advice.',
        )}
        {nutrition.missing.length
          ? ` ${t('Not counted, no data yet: {items}.', { items: nutrition.missing.map(tx).join(comma()).toLowerCase() })}`
          : ''}
      </AppText>
    </Card>
  );
}

// One macro's slice of the bar. It grows from nothing, the three one after another.
function Segment({ share, color, index }: { share: number; color: string; index: number }) {
  const grow = useRef(new Animated.Value(reduceMotion() ? share : 0)).current;
  useEffect(() => {
    if (reduceMotion()) {
      grow.setValue(share);
      return;
    }
    // flexGrow can't run on the native driver; it is three small views, animated once.
    Animated.timing(grow, {
      toValue: share,
      duration: 420,
      delay: 120 + index * 110,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [share, index, grow]);
  return <Animated.View style={{ flexGrow: grow, flexBasis: 0, backgroundColor: color }} />;
}

const styles = StyleSheet.create({
  card: { padding: 16, gap: 14 },
  flex: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  kcal: { fontFamily: fonts.display, fontSize: 40, lineHeight: 46, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  split: { gap: 8 },
  bar: { height: 10, borderRadius: radius.pill, overflow: 'hidden', flexDirection: 'row', gap: 2 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  row: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 12 },
  rowHead: { minHeight: 28, borderBottomWidth: 2, alignItems: 'flex-end', paddingBottom: 4 },
  indent: { paddingLeft: 16 },
  nums: { fontVariant: ['tabular-nums'] },
});
