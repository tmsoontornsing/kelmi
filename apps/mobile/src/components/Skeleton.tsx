import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';

import { useT } from '../i18n';
import { reduceMotion } from '../motion';
import { radius, useTheme } from '../theme';
import { Card } from './Buttons';

// A grey block where text or a picture will be. It breathes softly so the screen looks alive, and holds still when
// Reduce Motion is on.
export function Bone({ width = '100%', height = 14, round = radius.control, style }: { width?: DimensionValue; height?: number; round?: number; style?: StyleProp<ViewStyle> }) {
  const c = useTheme();
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View style={[{ width, height, borderRadius: round, backgroundColor: c.track, opacity: pulse }, style]} />;
}

// The shape of the week: the budget card, then days of tiles, so the layout does not jump when the plan arrives.
export function WeekSkeleton() {
  const { t } = useT();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('Building your plan')} style={styles.column}>
      <Card style={styles.budget}>
        <View style={styles.row}>
          <Bone width={90} height={12} />
          <Bone width={150} height={26} />
        </View>
        <Bone height={10} round={5} />
        <Bone width="40%" height={12} />
      </Card>
      {[0, 1].map((d) => (
        <Card key={d} style={styles.day}>
          <View style={styles.row}>
            <Bone width={120} height={24} />
            <Bone width={60} height={18} />
          </View>
          <View style={styles.tiles}>
            <Bone height={120} round={radius.row} style={styles.tile} />
            <Bone height={120} round={radius.row} style={styles.tile} />
          </View>
          <Bone height={84} round={radius.row} />
        </Card>
      ))}
    </View>
  );
}

// A list of rows, for groceries, pantry and anything else that loads as a column of items.
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const { t } = useT();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('Loading')} style={styles.column}>
      {Array.from({ length: rows }, (_, i) => (
        <Card key={i} style={styles.listRow}>
          <Bone width={40} height={40} round={20} />
          <View style={styles.flex}>
            <Bone width={`${55 + ((i * 13) % 35)}%`} height={14} />
            <Bone width="30%" height={10} />
          </View>
        </Card>
      ))}
    </View>
  );
}

// A recipe while its steps and ingredients load: the picture, the title, and two blocks of lines.
export function RecipeSkeleton() {
  const { t } = useT();
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={t('Loading recipe')} style={styles.column}>
      <Bone height={220} round={radius.card} />
      <Bone width="75%" height={28} />
      <Bone width="40%" height={14} />
      <Card style={styles.block}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Bone key={i} width={`${90 - i * 8}%`} height={12} />
        ))}
      </Card>
      <Card style={styles.block}>
        {[0, 1, 2].map((i) => (
          <Bone key={i} width={`${85 - i * 10}%`} height={12} />
        ))}
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  flex: { flex: 1, gap: 8 },
  budget: { padding: 16, gap: 12 },
  day: { padding: 16, gap: 12 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1 },
  listRow: { padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  block: { padding: 16, gap: 10 },
});
