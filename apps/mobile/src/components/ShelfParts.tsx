import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { reduceMotion } from '../motion';
import { radius, useTheme } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// The round icon on a pantry shelf. It plays its own little move once when the shelf appears and again each time an
// item is added: the basket bobs, the leaf wobbles, the snowflake turns, the apple bounces.
export function ShelfBadge({ name, icon, count, index }: { name: string; icon: IconName; count: number; index: number }) {
  const c = useTheme();
  const t = useRef(new Animated.Value(0)).current;
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const first = seen.current === null;
    const grew = seen.current !== null && count > seen.current;
    seen.current = count;
    if (reduceMotion() || !(first || grew)) return;
    t.setValue(0);
    Animated.timing(t, {
      toValue: 1,
      duration: 760,
      delay: first ? 260 + Math.min(index, 6) * 90 : 0,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [count, index, t]);

  const at = (outs: (number | string)[]) => t.interpolate({ inputRange: outs.map((_, i) => i / (outs.length - 1)), outputRange: outs as number[] });
  const motion =
    name === 'Staples'
      ? { transform: [{ translateY: at([0, -6, 0, -3, 0]) }] }
      : name === 'Spices'
        ? { transform: [{ rotate: at(['0deg', '-22deg', '18deg', '-10deg', '0deg']) as unknown as string }] }
        : name === 'Fridge'
          ? { transform: [{ rotate: at(['0deg', '360deg']) as unknown as string }] }
          : name === 'Produce'
            ? { transform: [{ scale: at([1, 1.35, 0.9, 1.1, 1]) }] }
            : { transform: [{ scale: at([1, 1.25, 1]) }] };

  return (
    <View style={[styles.badge, { backgroundColor: c.tint }]}>
      <Animated.View style={motion}>
        <Ionicons name={icon} size={16} color={c.primaryText} />
      </Animated.View>
    </View>
  );
}

// A shelf's card. When `pulse` goes up, the edge lights in the primary color and fades, so a shelf that was just moved
// is easy to find in its new spot.
export function ShelfCard({ pulse, children }: { pulse: number; children: ReactNode }) {
  const c = useTheme();
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (pulse === 0 || reduceMotion()) return;
    glow.setValue(1);
    Animated.timing(glow, { toValue: 0, duration: 1400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
  }, [pulse, glow]);

  return (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: c.card,
          borderColor: glow.interpolate({ inputRange: [0, 1], outputRange: [c.line, c.primary] }),
          shadowColor: c.primary,
          shadowOpacity: glow.interpolate({ inputRange: [0, 1], outputRange: [0, 0.28] }),
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  badge: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  card: {
    gap: 10,
    marginBottom: 14,
    paddingTop: 12,
    paddingBottom: 10,
    paddingHorizontal: 10,
    borderRadius: radius.card,
    borderWidth: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
});
