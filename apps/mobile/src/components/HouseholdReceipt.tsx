import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { useT } from '../i18n';
import { Reveal, reduceMotion, useCountUp } from '../motion';
import { fonts, useTheme } from '../theme';
import { AppText } from './AppText';
import { LivelyPip, Twinkles } from './LoginScene';
import { Mascot } from './Mascot';

// Pip falls in from above and settles on the top edge of the card below with a tilt, a beat after the card starts to appear.
// Reduce Motion puts him there already.
export function DroppingPip() {
  const { t } = useT();
  const drop = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.sequence([
      Animated.delay(260),
      Animated.spring(drop, { toValue: 1, useNativeDriver: true, damping: 9, stiffness: 150, mass: 0.9 }),
    ]).start();
    return () => drop.stopAnimation();
  }, [drop]);
  const style = {
    opacity: drop.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 1] }),
    transform: [
      { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-46, 0] }) },
      { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '6deg'] }) },
    ],
  };
  return (
    <Animated.View style={[styles.pip, style]} pointerEvents="box-none">
      <Mascot pose="save" size={84} tappable label={t('Pip, Kelmi\'s jar, holding a coin')} />
    </Animated.View>
  );
}

// The sign-in screen's proof of what is about to be saved: the person's own household answers, set out like a receipt.
// Pip drops onto the top edge, and the budget counts up. Reduce Motion shows everything in place.
// `compact` is the same receipt at its natural height, for when the email form is open and the sheet has no room to spare;
// otherwise it grows to fill the sheet.
export function HouseholdReceipt({ rows, budget, compact = false }: { rows: [string, string][]; budget: number; compact?: boolean }) {
  const c = useTheme();
  const { t } = useT();
  const shownBudget = useCountUp(budget, 700);

  return (
    <View style={compact ? styles.wrapTight : styles.wrap}>
      <Reveal lift={22} style={compact ? undefined : styles.grow}>
        <View style={[compact ? styles.paperTight : styles.paper, { backgroundColor: c.card, borderColor: c.line }]}>
          <View style={styles.head}>
            <AppText variant="eyebrow" color={c.muted}>
              {t('Your household')}
            </AppText>
            {compact ? null : (
              <View style={styles.headPip}>
                <LivelyPip size={58} pad={14} poses={['save', 'cheer', 'love', 'yum']} />
              </View>
            )}
          </View>
          {rows.map(([label, value], i) => (
            <Reveal key={label} index={i + 1} lift={8}>
              <View style={compact ? styles.rowTight : styles.row}>
                <AppText variant="subhead" color={c.muted}>
                  {label}
                </AppText>
                <AppText variant="subhead" weight="500" color={c.text} style={styles.value} numberOfLines={2}>
                  {value}
                </AppText>
              </View>
            </Reveal>
          ))}
          <View style={[styles.tear, { borderColor: c.control }]}>
            <AppText variant="headline">{t('Weekly budget')}</AppText>
            <AppText variant="money" color={c.primaryText} style={compact ? styles.budgetTight : styles.budget} accessibilityLabel={`$${budget}`}>{`$${Math.round(shownBudget)}`}</AppText>
            {compact ? null : (
              <Twinkles
                color="#8CC63F"
                spots={[{ left: "46%", top: 0, size: 16 }, { right: 0, top: -4, size: 20 }, { right: 58, bottom: -6, size: 14 }]}
              />
            )}
          </View>
        </View>
        <Svg width="100%" height={9} viewBox="0 0 300 9" preserveAspectRatio="none" accessibilityElementsHidden importantForAccessibility="no">
          <Path
            d="M0 0 H300 V2 L292 9 L284 2 L276 9 L268 2 L260 9 L252 2 L244 9 L236 2 L228 9 L220 2 L212 9 L204 2 L196 9 L188 2 L180 9 L172 2 L164 9 L156 2 L148 9 L140 2 L132 9 L124 2 L116 9 L108 2 L100 9 L92 2 L84 9 L76 2 L68 9 L60 2 L52 9 L44 2 L36 9 L28 2 L20 9 L12 2 L4 9 L0 2 Z"
            fill={c.card}
            stroke={c.line}
            strokeWidth={0.6}
          />
        </Svg>
      </Reveal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapTight: { alignSelf: 'stretch' },
  paperTight: { borderWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingHorizontal: 18, paddingTop: 12, paddingBottom: 6 },
  rowTight: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingVertical: 2 },
  budgetTight: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
  // No Pip here: the receipt takes all the room its parent gives it, with the rows spread evenly down the paper.
  wrap: { alignSelf: 'stretch', flexGrow: 1 },
  grow: { flex: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 20 },
  headPip: { marginTop: -22, marginRight: -6 },
  pip: { position: 'absolute', right: 14, top: 0, zIndex: 2 },
  paper: { borderWidth: StyleSheet.hairlineWidth, borderTopLeftRadius: 4, borderTopRightRadius: 4, paddingHorizontal: 18, paddingTop: 20, paddingBottom: 16, flex: 1, justifyContent: 'space-between' },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 16, paddingVertical: 8 },
  value: { flexShrink: 1, textAlign: 'right' },
  tear: { marginTop: 8, paddingTop: 10, paddingBottom: 2, borderTopWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  budget: { fontFamily: fonts.display, fontSize: 54, lineHeight: 58, letterSpacing: -1 },
});
