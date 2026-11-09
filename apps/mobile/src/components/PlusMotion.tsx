import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { reduceMotion } from '../motion';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';

// Motion for the Kelmi Plus screen. Every piece stands still when Reduce Motion is on.

const loop = (v: Animated.Value, to: number, ms: number, easing = Easing.inOut(Easing.sin), delay = 0) =>
  Animated.loop(
    Animated.sequence([
      Animated.delay(delay),
      Animated.timing(v, { toValue: to, duration: ms, easing, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: ms, easing, useNativeDriver: true }),
    ]),
  );

// Floats up and down, slowly, like a balloon.
export function Float({ children, by = 6, ms = 1900, style }: { children: ReactNode; by?: number; ms?: number; style?: StyleProp<ViewStyle> }) {
  const y = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const a = loop(y, 1, ms);
    a.start();
    return () => a.stop();
  }, [y, ms]);
  return (
    <Animated.View style={[style, { transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [by / 2, -by / 2] }) }] }]}>
      {children}
    </Animated.View>
  );
}

// Small stars that twinkle around whatever they sit behind: each swells, glows and fades on its own beat.
const SPARKS = [
  { top: '4%', left: '2%', size: 14, delay: 0 },
  { top: '-2%', left: '58%', size: 18, delay: 500 },
  { top: '94%', left: '44%', size: 12, delay: 1100 },
  { top: '64%', left: '80%', size: 16, delay: 300 },
  { top: '78%', left: '-2%', size: 12, delay: 900 },
  { top: '46%', left: '-6%', size: 10, delay: 1500 },
] as const;

export function Sparkles() {
  const c = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {SPARKS.map((s, i) => (
        <Spark key={i} {...s} color={i % 2 ? c.badge : c.primary} />
      ))}
    </View>
  );
}

function Spark({ top, left, size, delay, color }: (typeof SPARKS)[number] & { color: string }) {
  const t = useRef(new Animated.Value(reduceMotion() ? 0.6 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(t, { toValue: 1, duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 1100, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
        Animated.delay(600),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [t, delay]);
  return (
    <Animated.View
      style={{
        position: 'absolute',
        top,
        left,
        opacity: t,
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.15] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['-30deg', '20deg'] }) },
        ],
      }}
    >
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}

// A sparkle icon that turns and swells on a slow loop, for a bullet that should catch the eye.
export function Twinkle({ delay = 0, color, size = 15 }: { delay?: number; color: string; size?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const a = loop(t, 1, 700, Easing.inOut(Easing.quad), delay);
    a.start();
    return () => a.stop();
  }, [t, delay]);
  return (
    <Animated.View
      accessibilityElementsHidden
      style={{
        transform: [
          { scale: t.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '72deg'] }) },
        ],
      }}
    >
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}

// A headline that arrives word by word, each rising into place a beat after the one before.
export function WordRise({ text, style, delay = 250 }: { text: string; style: object; delay?: number }) {
  const words = text.split(' ');
  return (
    <View style={styles.words} accessible accessibilityRole="header" accessibilityLabel={text}>
      {words.map((w, i) => (
        <Word key={`${w}-${i}`} delay={delay + i * 110}>
          <AppText style={style}>{i < words.length - 1 ? `${w} ` : w}</AppText>
        </Word>
      ))}
    </View>
  );
}

function Word({ children, delay }: { children: ReactNode; delay: number }) {
  const v = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.spring(v, { toValue: 1, delay, useNativeDriver: true, damping: 12, stiffness: 150, mass: 0.7 }).start();
  }, [v, delay]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.6], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }, { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Soft green glows drifting slowly behind the page, so the background never sits still.
export function Orbs() {
  const c = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const la = loop(a, 1, 4200);
    const lb = loop(b, 1, 5200, Easing.inOut(Easing.sin), 800);
    la.start();
    lb.start();
    return () => {
      la.stop();
      lb.stop();
    };
  }, [a, b]);
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Animated.View
        style={[
          styles.orb,
          { top: 40, right: -90, width: 260, height: 260, backgroundColor: c.tint, opacity: 0.9 },
          { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-14, 22] }) }, { translateX: a.interpolate({ inputRange: [0, 1], outputRange: [10, -16] }) }] },
        ]}
      />
      <Animated.View
        style={[
          styles.orb,
          { top: 300, left: -110, width: 240, height: 240, backgroundColor: c.badge, opacity: 0.16 },
          { transform: [{ translateY: b.interpolate({ inputRange: [0, 1], outputRange: [18, -20] }) }, { scale: b.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.12] }) }] },
        ]}
      />
    </View>
  );
}

// Comes into view as you scroll: rising, fading and settling in from the side, once its top edge is on screen.
// `scrollY` is the page's scroll value, so the motion follows the finger.
export function ScrollReveal({ scrollY, from = 'left', children }: { scrollY: Animated.Value; from?: 'left' | 'right' | 'up'; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const [y, setY] = useState<number | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setY(e.nativeEvent.layout.y);
  if (reduceMotion()) return <View>{children}</View>;
  // Not placed yet: hold it invisible for a frame rather than flash it in the wrong place.
  if (y === null) return <View onLayout={onLayout} style={{ opacity: 0 }}>{children}</View>;
  // Visible while its top is between the bottom of the screen and a little above it.
  const start = y - height + 60;
  const end = y - height + 300;
  const progress = scrollY.interpolate({ inputRange: [start, end], outputRange: [0, 1], extrapolate: 'clamp' });
  const dx = from === 'left' ? -46 : from === 'right' ? 46 : 0;
  return (
    <Animated.View
      onLayout={onLayout}
      style={{
        opacity: progress,
        transform: [
          { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [dx, 0] }) },
          { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
          { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// A call-to-action button wrapper: a ring of light pulses out behind it and a glint sweeps across it every few seconds.
export function Glint({ children }: { children: ReactNode }) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const ring = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const r = Animated.loop(Animated.timing(ring, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    const s = Animated.loop(
      Animated.sequence([
        Animated.delay(1400),
        Animated.timing(sweep, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1800),
        Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    r.start();
    s.start();
    return () => {
      r.stop();
      s.stop();
    };
  }, [ring, sweep]);
  return (
    <View onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.ring,
          {
            borderColor: c.primary,
            opacity: ring.interpolate({ inputRange: [0, 1], outputRange: [0.45, 0] }),
            transform: [{ scaleX: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] }) }, { scaleY: ring.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] }) }],
          },
        ]}
      />
      <View style={styles.clip}>
        {children}
        <Animated.View
          pointerEvents="none"
          style={[styles.glint, { transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-80, w + 40] }) }, { rotate: '18deg' }] }]}
        />
      </View>
    </View>
  );
}

// Tips side to side now and then, like a price tag swinging on a shelf.
export function Wobble({ children }: { children: ReactNode }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const a = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(t, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.timing(t, { toValue: -1, duration: 200, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0.6, duration: 160, useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 140, useNativeDriver: true }),
      ]),
    );
    a.start();
    return () => a.stop();
  }, [t]);
  return <Animated.View style={{ transform: [{ rotate: t.interpolate({ inputRange: [-1, 1], outputRange: ['-7deg', '7deg'] }) }] }}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  words: { flexDirection: 'row', flexWrap: 'wrap' },
  orb: { position: 'absolute', borderRadius: 999 },
  ring: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, borderRadius: radius.pill, borderWidth: 2 },
  clip: { borderRadius: radius.pill, overflow: 'hidden' },
  glint: { position: 'absolute', top: -20, bottom: -20, width: 36, backgroundColor: 'rgba(255,255,255,0.38)' },
});
