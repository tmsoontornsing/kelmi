import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';

import { reduceMotion } from '../motion';
import { useTheme } from '../theme';

type Shape = (ink: string, fill: string) => React.ReactNode;

// Small ink doodles in the same hand as Pip: round caps, no fill but a pale tint. Each is drawn in a 48 x 48 box.
const stroke = (ink: string, w = 2.6) => ({ stroke: ink, strokeWidth: w, strokeLinecap: 'round', strokeLinejoin: 'round' }) as const;
const SHAPES: Shape[] = [
  // leaf
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill}>
      <Path d="M9 39 C9 19 21 8 39 8 C39 27 28 39 9 39 Z" />
      <Path d="M9 39 L29 18" fill="none" />
    </G>
  ),
  // tomato
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill}>
      <Circle cx={24} cy={27} r={15} />
      <Path d="M24 12 l-5 5 M24 12 l5 5 M24 12 v7 M24 12 q3 -5 8 -4" fill="none" />
    </G>
  ),
  // lemon
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill} rotation={-25} origin="24, 24">
      <Ellipse cx={24} cy={24} rx={17} ry={11} />
      <Path d="M5 24 h-3 M43 24 h3" fill="none" />
    </G>
  ),
  // egg
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill}>
      <Path d="M24 7 C15 7 10 23 10 30 C10 38 16 42 24 42 C32 42 38 38 38 30 C38 23 33 7 24 7 Z" />
    </G>
  ),
  // spoon
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill}>
      <Ellipse cx={17} cy={16} rx={8} ry={10} rotation={45} origin="17, 16" />
      <Path d="M23 22 L40 39" fill="none" />
    </G>
  ),
  // little jar
  (ink, fill) => (
    <G {...stroke(ink)} fill={fill}>
      <Rect x={14} y={8} width={20} height={8} rx={2} />
      <Path d="M16 16 V19 Q10 22 10 28 V38 Q10 42 14 42 H34 Q38 42 38 38 V28 Q38 22 32 19 V16" />
    </G>
  ),
];

// Where each doodle lives: column as a share of the width, size, seconds for one trip up the screen, and a phase so the
// screen never starts empty or in lockstep.
const ITEMS = [
  { s: 0, x: 0.06, size: 44, secs: 26, phase: 0.1 },
  { s: 2, x: 0.78, size: 40, secs: 31, phase: 0.45 },
  { s: 5, x: 0.34, size: 46, secs: 34, phase: 0.8 },
  { s: 1, x: 0.88, size: 38, secs: 24, phase: 0.7 },
  { s: 3, x: 0.52, size: 34, secs: 28, phase: 0.28 },
  { s: 4, x: 0.18, size: 42, secs: 36, phase: 0.62 },
  { s: 0, x: 0.66, size: 36, secs: 30, phase: 0.95 },
  { s: 1, x: 0.44, size: 40, secs: 38, phase: 0.05 },
  { s: 5, x: 0.92, size: 32, secs: 33, phase: 0.38 },
  { s: 2, x: 0.02, size: 36, secs: 29, phase: 0.55 },
];
const PEAK = 0.2; // opacity at its clearest, so it stays behind the copy

// Pantry doodles drift up the screen like bubbles in a jar. Sits behind a screen's content and ignores touches.
export const PantryDrift = memo(function PantryDrift() {
  const c = useTheme();
  const { width, height } = useWindowDimensions();
  return (
    <Animated.View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {ITEMS.map((it, i) => (
        <Doodle key={i} item={it} width={width} height={height} ink={c.text} fill={c.tint} />
      ))}
    </Animated.View>
  );
});

function Doodle({
  item,
  width,
  height,
  ink,
  fill,
}: {
  item: (typeof ITEMS)[number];
  width: number;
  height: number;
  ink: string;
  fill: string;
}) {
  const still = reduceMotion();
  const rise = useRef(new Animated.Value(item.phase)).current;
  const sway = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (still) {
      rise.setValue(item.phase);
      return;
    }
    rise.setValue(item.phase);
    const trip = item.secs * 1000;
    const loop = Animated.sequence([
      Animated.timing(rise, { toValue: 1, duration: (1 - item.phase) * trip, easing: Easing.linear, useNativeDriver: true }),
      Animated.loop(
        Animated.sequence([
          Animated.timing(rise, { toValue: 0, duration: 0, useNativeDriver: true }),
          Animated.timing(rise, { toValue: 1, duration: trip, easing: Easing.linear, useNativeDriver: true }),
        ]),
      ),
    ]);
    const wobble = Animated.loop(
      Animated.sequence([
        Animated.timing(sway, { toValue: 1, duration: 2600 + item.size * 40, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(sway, { toValue: -1, duration: 2600 + item.size * 40, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    wobble.start();
    return () => {
      loop.stop();
      wobble.stop();
    };
  }, [item, still, rise, sway]);

  const style = useMemo(
    () => ({
      opacity: rise.interpolate({ inputRange: [0, 0.08, 0.92, 1], outputRange: [0, PEAK, PEAK, 0] }),
      transform: [
        { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [height + item.size, -item.size * 1.5] }) },
        { translateX: sway.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] }) },
        { rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ['-12deg', '12deg'] }) },
      ],
    }),
    [rise, sway, height, item.size],
  );

  return (
    <Animated.View style={[{ position: 'absolute', left: item.x * (width - item.size), top: 0, width: item.size, height: item.size }, style]}>
      <Svg width={item.size} height={item.size} viewBox="0 0 48 48">
        {SHAPES[item.s](ink, fill)}
      </Svg>
    </Animated.View>
  );
}
