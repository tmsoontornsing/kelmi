import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Switch, View } from 'react-native';

import { haptic, PressableScale, reduceMotion } from '../motion';
import { LottieOnce } from './Lottie';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';

// The bar fills in on first show and glides to each new value.
export function ProgressBar({
  value,
  max,
  color,
  label,
}: {
  value: number;
  max: number;
  color?: string;
  label: string;
}) {
  const c = useTheme();
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const width = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion()) {
      width.setValue(pct);
      return;
    }
    // Width can't use the native driver, but the bar is small and animates rarely.
    Animated.timing(width, {
      toValue: pct,
      duration: 450,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, width]);

  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max, now: Math.min(value, max) }}
      style={[styles.track, { backgroundColor: c.track }]}
    >
      <Animated.View
        style={[
          styles.fill,
          { width: width.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] }), backgroundColor: color ?? c.primary },
        ]}
      />
    </View>
  );
}

// Round radio indicator used in diet, plan, and swap choices. Pops when it becomes selected.
export function RadioDot({ on }: { on: boolean }) {
  const c = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!on || reduceMotion()) return;
    scale.setValue(0.78);
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 30, bounciness: 12 }).start();
  }, [on, scale]);

  return (
    <Animated.View
      style={[
        styles.dot,
        on ? { borderWidth: 7, borderColor: c.primary } : { borderWidth: 2, borderColor: c.control },
        { transform: [{ scale }] },
      ]}
    />
  );
}

// Reminders-style check circle for grocery rows. The fill and check spring in together.
export function CheckCircle({ on }: { on: boolean }) {
  const c = useTheme();
  const pop = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    if (reduceMotion()) {
      pop.setValue(on ? 1 : 0);
      return;
    }
    Animated.spring(pop, { toValue: on ? 1 : 0, useNativeDriver: true, speed: 22, bounciness: 10 }).start();
  }, [on, pop]);

  return (
    <View style={[styles.check, { borderColor: on ? c.primary : c.control }]}>
      <Animated.View style={[styles.checkFill, { backgroundColor: c.primary, opacity: pop, transform: [{ scale: pop }] }]}>
        <Ionicons name="checkmark" size={15} color={c.onPrimary} />
      </Animated.View>
      {/* A little burst the moment it is ticked, drawn larger than the circle and centered on it. */}
      <LottieOnce name="sparkle" size={52} trigger={on ? 1 : 0} style={styles.sparkle} />
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  const c = useTheme();
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ selected }}
      to={0.94}
      onPress={() => {
        haptic.select();
        onPress();
      }}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: c.primary, borderColor: c.primary }
          : { backgroundColor: c.card, borderColor: c.control },
        { opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <AppText style={{ fontSize: 15, fontWeight: '500' }} color={selected ? c.onPrimary : c.text}>
        {label}
      </AppText>
    </PressableScale>
  );
}

export function KelmiSwitch({
  value,
  onValueChange,
  label,
}: {
  value: boolean;
  onValueChange: (v: boolean) => void;
  label: string;
}) {
  const c = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={(v) => {
        haptic.select();
        onValueChange(v);
      }}
      trackColor={{ true: c.primary, false: c.switchOff }}
      ios_backgroundColor={c.switchOff}
    />
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.pill, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill },
  dot: { width: 22, height: 22, borderRadius: 11 },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sparkle: { position: 'absolute', left: -16, top: -16 },
  checkFill: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    justifyContent: 'center',
  },
});
