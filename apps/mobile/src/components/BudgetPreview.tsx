import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n';
import { Reveal, useCountUp } from '../motion';
import { fonts, useTheme } from '../theme';
import { AppText } from './AppText';
import { ProgressBar } from './Controls';
import { DroppingPip } from './HouseholdReceipt';
import { Mascot } from './Mascot';

// What the unsaved week costs against the household's own weekly budget, with the settings it was planned for. Everything
// here comes from the person's answers and plan, and the cost is labeled an estimate, because Kelmi never quotes exact prices.
// `compact` drops the detail rows to leave room for the email form beneath. `showPip` puts Pip on the card's top edge.
// `fill` stretches the card to take all the room its parent gives it, for short screens where Pip is left out.
export function BudgetPreview({
  total,
  budget,
  people,
  chips,
  meals,
  items,
  compact = false,
  showPip = true,
  fill = false,
}: {
  total: number;
  budget: number;
  people: number;
  // The choices the week was planned around (goal, diet, allergies and so on), one short label each.
  chips: string[];
  // Meals in the plan that are being cooked or eaten, so the count matches the cost above it.
  meals: number;
  items: number;
  compact?: boolean;
  showPip?: boolean;
  fill?: boolean;
}) {
  const c = useTheme();
  const { t } = useT();
  const shown = Math.round(useCountUp(Math.round(total), 700));
  const over = total > budget;
  const diff = Math.round(Math.abs(budget - total));
  const accent = over ? c.warn : c.primaryText;

  return (
    <View style={[styles.wrap, showPip ? styles.pipRoom : null, fill ? styles.grow : null]}>
      {showPip ? <DroppingPip /> : null}
      <Reveal lift={22} style={fill ? styles.grow : undefined}>
        <View style={[styles.card, fill ? [styles.grow, styles.cardFill] : null, { backgroundColor: c.card, borderColor: c.line }]}>
          {/* With no room above the card, Pip sits in its empty top-right corner instead. */}
          {!showPip && !compact ? (
            <View style={styles.cornerPip} pointerEvents="box-none">
              <Mascot pose="save" size={84} tappable label={t('Pip, Kelmi\'s jar, holding a coin')} />
            </View>
          ) : null}
          <View style={styles.group}>
            <AppText variant="eyebrow" color={c.muted}>
              {t('Estimated this week')}
            </AppText>
            <View style={styles.big}>
              <AppText style={[styles.total, fill ? styles.totalFill : null, { color: accent }]} accessibilityLabel={`$${Math.round(total)}`}>{`$${shown}`}</AppText>
              <AppText variant="subhead">{t('of your ${budget} budget', { budget })}</AppText>
            </View>
            <ProgressBar
              value={total}
              max={budget}
              color={over ? c.warn : c.primary}
              label={t('Estimated ${total} of ${budget} budget', { total: Math.round(total), budget })}
            />
            <AppText variant="subhead" weight="500" color={accent} style={styles.status}>
              {over
                ? t('${amount} over budget. You can swap meals after you sign in.', { amount: diff })
                : t('${amount} left this week', { amount: diff })}
            </AppText>
          </View>

          {compact ? null : (
            <View style={styles.group}>
              {/* A dashed border needs height to draw, so a taller bordered box is clipped down to its top edge. */}
              <View style={styles.rule}>
                <View style={[styles.ruleDash, { borderColor: c.control }]} />
              </View>
              <View style={styles.pair}>
                <Line label={t('Meals planned')} value={String(meals)} />
                {items > 0 ? <Line label={t('Grocery items')} value={String(items)} /> : null}
              </View>
              {people > 1 ? (
                <View style={styles.pair}>
                  <Line label={t('Per person, about')} value={`$${Math.round(total / people)}`} />
                  <View style={styles.line} />
                </View>
              ) : null}
              <View style={styles.chips}>
                {chips.map((chip) => (
                  <View key={chip} style={[styles.chip, { backgroundColor: c.tint, borderColor: c.line }]}>
                    <AppText variant="footnote" color={c.text}>
                      {chip}
                    </AppText>
                  </View>
                ))}
              </View>
            </View>
          )}
        </View>
        <AppText variant="footnote" style={styles.note}>
          {t('US average prices. Yours will differ.')}
        </AppText>
      </Reveal>
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  const c = useTheme();
  return (
    <View style={styles.line}>
      <AppText variant="subhead">{label}</AppText>
      <AppText variant="subhead" weight="500" color={c.text}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch' },
  pipRoom: { paddingTop: 90 },
  grow: { flexGrow: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 6, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 16, gap: 8 },
  // Filling the screen: the headline numbers sit at the top and the detail rows at the bottom, with the air between them.
  cardFill: { justifyContent: 'space-between', paddingTop: 20, paddingBottom: 20 },
  cornerPip: { position: 'absolute', right: 12, top: 12, zIndex: 1 },
  group: { gap: 8 },
  big: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  total: { fontFamily: fonts.display, fontSize: 48, lineHeight: 52, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  totalFill: { fontSize: 54, lineHeight: 58 },
  status: { marginTop: 2 },
  rule: { height: 1.5, overflow: 'hidden', marginVertical: 4 },
  ruleDash: { height: 6, borderWidth: 1.5, borderStyle: 'dashed', borderRadius: 0 },
  // Two figures side by side, each with its label and value pushed to opposite ends of its half.
  pair: { flexDirection: 'row', gap: 24 },
  line: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  chip: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 2 },
  note: { marginTop: 8 },
});
