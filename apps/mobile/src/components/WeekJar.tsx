import { useEffect, useRef, type ComponentType } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { ClipPath, Defs, G, Path, Rect, type RectProps } from 'react-native-svg';

import { useT } from '../i18n';
import { reduceMotion } from '../motion';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';

type Day = { day: string; meal: string; cost: number };

type AnimatedRectProps = Omit<RectProps, 'y' | 'height'> & {
  y: Animated.AnimatedInterpolation<number>;
  height: Animated.AnimatedInterpolation<number>;
};
const AnimatedRect = Animated.createAnimatedComponent(Rect) as unknown as ComponentType<AnimatedRectProps>;

// Same jar as Pip, without the face.
const JAR = 'M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z';
const FLOOR = 160;
const FULL = 60; // where the top of a full jar sits

// An example week that plays itself: each day drops its cost into the jar, the level rises, and it settles on what is left.
// Loops while on screen. Reduce Motion shows the finished week.
export function WeekJar({ title, days, budget, label }: { title: string; days: Day[]; budget: number; label: string }) {
  const c = useTheme();
  const { t, tx } = useT();
  const total = days.reduce((sum, d) => sum + d.cost, 0);
  // The total is drawn larger, so the phrase is split where it goes.
  const [before, after = ''] = t('{total} of ${budget}', { budget }).split('{total}');
  const still = reduceMotion();

  const level = useRef(new Animated.Value(still ? total / budget : 0)).current;
  const rows = useRef(days.map(() => new Animated.Value(still ? 1 : 0))).current;
  const summary = useRef(new Animated.Value(still ? 1 : 0)).current;

  useEffect(() => {
    if (still) return;
    let running = 0;
    const fade = (v: Animated.Value, toValue: number, duration: number) =>
      Animated.timing(v, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const fill = (toValue: number, duration: number) =>
      Animated.timing(level, { toValue, duration, easing: Easing.out(Easing.cubic), useNativeDriver: false });

    const drops = days.map((d, i) => {
      running += d.cost;
      return Animated.sequence([Animated.parallel([fade(rows[i], 1, 240), fill(running / budget, 520)]), Animated.delay(150)]);
    });
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(600),
        ...drops,
        fade(summary, 1, 300),
        Animated.delay(3800),
        Animated.parallel([...rows.map((v) => fade(v, 0, 300)), fade(summary, 0, 300), fill(0, 500)]),
        Animated.delay(400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [still, days, budget, level, rows, summary]);

  const y = level.interpolate({ inputRange: [0, 1], outputRange: [FLOOR, FULL], extrapolate: 'clamp' });
  const height = level.interpolate({ inputRange: [0, 1], outputRange: [0, FLOOR - FULL], extrapolate: 'clamp' });

  return (
    <View accessible accessibilityLabel={label} style={[styles.card, { backgroundColor: c.card }]}>
      <AppText variant="eyebrow">{title}</AppText>
      <View style={styles.body}>
        <Svg width={80} height={104} viewBox="46 28 108 140" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Defs>
            <ClipPath id="weekjar-glass">
              <Path d={JAR} />
            </ClipPath>
          </Defs>
          <Path d={JAR} fill={c.tint} />
          <G clipPath="url(#weekjar-glass)">
            <AnimatedRect x={40} width={120} y={y} height={height} fill={c.primary} fillOpacity={0.9} />
          </G>
          <Path d="M64 92 v14" stroke={c.card} strokeWidth={4} strokeLinecap="round" />
          <Path d={JAR} fill="none" stroke={c.text} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          <Rect x={68} y={40} width={64} height={16} rx={4} fill={c.tint} stroke={c.text} strokeWidth={3.5} />
          <Path d="M78 45 v6 M88 45 v6 M98 45 v6 M108 45 v6 M118 45 v6" stroke={c.text} strokeWidth={2} strokeLinecap="round" />
          <Rect x={72} y={32} width={56} height={10} rx={4} fill={c.card} stroke={c.text} strokeWidth={3.5} />
        </Svg>
        <View style={styles.list}>
          {days.map((d, i) => (
            <Animated.View
              key={d.day}
              style={[
                styles.row,
                { opacity: rows[i], transform: [{ translateX: rows[i].interpolate({ inputRange: [0, 1], outputRange: [-10, 0] }) }] },
              ]}
            >
              <AppText variant="subhead" color={c.muted} numberOfLines={1} style={styles.day}>{tx(d.day)}</AppText>
              <AppText variant="subhead" color={c.text} numberOfLines={1} style={styles.meal}>{tx(d.meal)}</AppText>
              <AppText variant="subhead" color={c.text} style={styles.num}>{`$${d.cost}`}</AppText>
            </Animated.View>
          ))}
        </View>
      </View>
      <Animated.View style={[styles.summary, { opacity: summary }]}>
        {before.trim() ? <AppText variant="subhead" color={c.text}>{before}</AppText> : null}
        <AppText style={styles.money} color={c.text}>{`$${total}`}</AppText>
        <AppText variant="subhead" color={c.text}>
          {`${after} · `}
          <AppText variant="subhead" color={c.primaryText} weight="500">
            {t('${amount} to spare', { amount: budget - total })}
          </AppText>
        </AppText>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.card, padding: 16, gap: 10 },
  body: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  list: { flex: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  day: { width: 30, fontSize: 14 },
  meal: { flex: 1, fontSize: 14 },
  num: { fontVariant: ['tabular-nums'], fontSize: 14 },
  summary: { flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 },
  money: { fontFamily: fonts.displaySemi, fontSize: 24, lineHeight: 30, fontVariant: ['tabular-nums'] },
});
