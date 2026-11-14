import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';

import { reduceMotion } from '../motion';
import { useTheme } from '../theme';
import { Mascot, type MascotPose } from './Mascot';

type IconName = ComponentProps<typeof Ionicons>['name'];

// Food and grocery icons that drift up the screen behind the log-in page, each at its own speed, size and sway.
// left is a percentage of the width, so they spread out on any phone.
const DRIFTERS: { icon: IconName; left: number; size: number; delay: number; duration: number; sway: number; lime?: boolean }[] = [
  { icon: 'nutrition', left: 6, size: 30, delay: 0, duration: 6500, sway: 16 },
  { icon: 'leaf', left: 22, size: 24, delay: 450, duration: 7600, sway: 22, lime: true },
  { icon: 'pizza', left: 40, size: 28, delay: 900, duration: 8700, sway: 14 },
  { icon: 'cart', left: 58, size: 30, delay: 1350, duration: 9800, sway: 18 },
  { icon: 'egg', left: 74, size: 24, delay: 1800, duration: 6500, sway: 20, lime: true },
  { icon: 'fish', left: 88, size: 28, delay: 2250, duration: 7600, sway: 16 },
  { icon: 'pricetag', left: 14, size: 22, delay: 2700, duration: 8700, sway: 12, lime: true },
  { icon: 'restaurant', left: 50, size: 26, delay: 3150, duration: 9800, sway: 24 },
  { icon: 'flame', left: 68, size: 22, delay: 3600, duration: 6500, sway: 14 },
  { icon: 'cafe', left: 32, size: 24, delay: 4050, duration: 7600, sway: 18, lime: true },
];

function Drifter({ item, height, tint, lime }: { item: (typeof DRIFTERS)[number]; height: number; tint: string; lime: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(item.delay),
        Animated.timing(v, { toValue: 1, duration: item.duration, easing: Easing.linear, useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, item.delay, item.duration]);

  // With Reduce Motion they sit still, scattered, instead of moving.
  const still = reduceMotion();
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.drifter,
        { left: `${item.left}%` },
        still
          ? { top: `${(item.left * 7) % 80}%`, opacity: 0.18 }
          : {
              opacity: v.interpolate({ inputRange: [0, 0.12, 0.85, 1], outputRange: [0, 0.5, 0.5, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [height + 20, -60] }) },
                { translateX: v.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [0, item.sway, 0, -item.sway, 0] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '24deg'] }) },
              ],
            },
      ]}
    >
      <Ionicons name={item.icon} size={item.size} color={item.lime ? lime : tint} />
    </Animated.View>
  );
}

function Blob({ color, size, style, duration, dx, dy }: { color: string; size: number; style: ViewStyle; duration: number; dx: number; dy: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, duration]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        style,
        {
          transform: [
            { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
          ],
        },
      ]}
    />
  );
}

// Everything moving behind the log-in page. It never takes touches and is only decoration, so a screen reader skips it.
export function LoginBackdrop() {
  const c = useTheme();
  const [height, setHeight] = useState(800);
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
    >
      <Blob color={c.tint} size={320} style={{ top: -110, right: -110, opacity: 0.85 }} duration={6500} dx={-24} dy={30} />
      <Blob color={c.badge} size={220} style={{ top: '38%', left: -90, opacity: 0.22 }} duration={8000} dx={30} dy={-26} />
      <Blob color={c.tint} size={260} style={{ bottom: -100, right: -60, opacity: 0.6 }} duration={7200} dx={-34} dy={-20} />
      {DRIFTERS.map((item) => (
        <Drifter key={item.icon} item={item} height={height} tint={c.primary} lime="#8CC63F" />
      ))}
    </View>
  );
}

const PIP_CYCLE: MascotPose[] = ['wave', 'cheer', 'love', 'yum'];

// Pip for the log-in page: drops in, bobs, ripples a halo, and changes pose every few seconds with a hop. Tap Pip for a poke.
export function LivelyPip({ size = 120 }: { size?: number }) {
  const c = useTheme();
  const [i, setI] = useState(0);
  const drop = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const ring = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduceMotion()) return;
    Animated.spring(drop, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 120, mass: 0.9 }).start();
    const loops = [
      Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]),
      ),
      Animated.loop(Animated.timing(ring, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true })),
    ];
    loops.forEach((l) => l.start());
    const timer = setInterval(() => {
      setI((n) => (n + 1) % PIP_CYCLE.length);
      hop.setValue(0);
      Animated.spring(hop, { toValue: 1, useNativeDriver: true, damping: 5, stiffness: 220 }).start();
    }, 3200);
    return () => {
      loops.forEach((l) => l.stop());
      clearInterval(timer);
    };
  }, [drop, bob, hop, ring]);

  const box = size + 40;
  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }}>
      {[0, 0.5].map((o) => (
        <Animated.View
          key={o}
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: c.tint,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }),
            transform: [{ scale: ring.interpolate({ inputRange: [0, 1], outputRange: [1 + o * 0.3, 1.8 + o * 0.3] }) }],
          }}
        />
      ))}
      <View pointerEvents="none" style={{ position: 'absolute', width: size, height: size, borderRadius: size / 2, backgroundColor: c.tint }} />
      <Animated.View
        style={{
          opacity: drop,
          transform: [
            { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-90, 0] }) },
            { translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) },
            { translateY: hop.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, -16, 0] }) },
            { rotate: drop.interpolate({ inputRange: [0, 1], outputRange: ['-18deg', '0deg'] }) },
          ],
        }}
      >
        <Mascot pose={PIP_CYCLE[i]} size={size} tappable decorative />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  drifter: { position: 'absolute', top: 0 },
});
