import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, useColorScheme, useWindowDimensions, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Ellipse, G, Path, Rect, Text as SvgText } from 'react-native-svg';

import { useT } from '../i18n';
import { haptic, reduceMotion } from '../motion';
import { fonts, radius, useTheme } from '../theme';
import { AppText } from './AppText';

// Pip's welcome to Kelmi Plus, about 4.7 seconds: drops in with a ground shockwave and a sunburst, pops its lid while bubbles
// rise in the filling jar, cheers with a confetti cannon and a stamped PLUS badge, dances, then the welcome line and three
// perks land. One clock (`tm`, in milliseconds) drives every moving part through sampled curves, so the whole thing runs on
// the native thread and stays in step. Reduce Motion skips straight to the finished pose.

const END = 5200;
const STEP = 40;
const STILL_AT = 4300;
const PTS = Array.from({ length: END / STEP + 1 }, (_, n) => n * STEP);

const COLORS = {
  light: { INK: '#13241A', G: '#3DAA84', TINT: '#CFE8DA', GLASS: '#E8F3EC', BLUSH: '#F4AE9C', W: '#FFFFFF', LIME: '#A7D96B' },
  dark: { INK: '#E8F1EB', G: '#5CC99A', TINT: '#2C4A3A', GLASS: '#1F3328', BLUSH: '#C97F70', W: '#17231C', LIME: '#A7D96B' },
} as const;
type Palette = (typeof COLORS)['light' | 'dark'];

const JAR = 'M74 52 H126 V64 Q126 70 134 76 Q146 84 146 98 V142 Q146 160 128 160 H72 Q54 160 54 142 V98 Q54 84 66 76 Q74 70 74 64 Z';
const stroke = (c: Palette, w: number) => ({ stroke: c.INK, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const });

const clamp = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
const easeOut = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInOut = (x: number) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
const easeBack = (x: number) => 1 + 2.70158 * Math.pow(x - 1, 3) + 1.70158 * Math.pow(x - 1, 2);
const keys = (p: number, ins: number[], outs: number[]) => {
  for (let i = 1; i < ins.length; i++) if (p <= ins[i]) return outs[i - 1] + ((outs[i] - outs[i - 1]) * (p - ins[i - 1])) / (ins[i] - ins[i - 1]);
  return outs[outs.length - 1];
};
const rnd = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const dance = (ms: number) => seg(ms, 2300, 2420) * (1 - seg(ms, 3950, 4350));

// A layer is one drawing in Pip's 200 by 200 space.
function Layer({ size, children }: { size: number; children: React.ReactNode }) {
  return (
    <Svg style={StyleSheet.absoluteFill} width={size} height={size} viewBox="0 0 200 200">
      {children}
    </Svg>
  );
}

// A drawing cropped to `box`, inside a view that is exactly that box, so it scales and turns around its own center.
function Box({ size, box, style, children }: { size: number; box: [number, number, number, number]; style?: object; children: React.ReactNode }) {
  const k = size / 200;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: box[0] * k, top: box[1] * k, width: box[2] * k, height: box[3] * k }, style]}>
      <Svg width={box[2] * k} height={box[3] * k} viewBox={box.join(' ')}>
        {children}
      </Svg>
    </Animated.View>
  );
}

const star = (cx: number, cy: number, r: number) => {
  const pts = Array.from({ length: 8 }, (_, n) => {
    const a = (n * Math.PI) / 4 - Math.PI / 2;
    const d = n % 2 === 0 ? r : r * 0.26;
    return `${(cx + Math.cos(a) * d).toFixed(1)} ${(cy + Math.sin(a) * d).toFixed(1)}`;
  });
  return `M${pts.join(' L')} Z`;
};

// Positions are in Pip's 200 space; the colors name keys of the palette.
const SPARKS = [
  { x: 14, y: 22, fill: 'LIME' },
  { x: 188, y: 5, fill: 'W' },
  { x: 26, y: 141, fill: 'G' },
  { x: 178, y: 126, fill: 'LIME' },
  { x: 100, y: -19, fill: 'BLUSH' },
] as const;

const BUBBLES = Array.from({ length: 7 }, (_, i) => ({ x: 66 + i * 11, r: 2 + (i % 3), speed: 0.03 + (i % 4) * 0.01, off: i * 23 }));
const BURST = Array.from({ length: 10 }, (_, i) => ({ a: (i * Math.PI * 2) / 10 - Math.PI / 2, color: i % 2 ? 'G' : 'LIME' }) as const);
const CONFETTI = Array.from({ length: 34 }, (_, i) => {
  const rain = i >= 22;
  const bar = rnd(i + 3) > 0.5;
  return {
    rain,
    bar,
    color: (['LIME', 'G', 'BLUSH', 'INK', 'TINT', 'LIME'] as const)[i % 6],
    from: rain ? 2250 + rnd(i) * 500 : 1900,
    vx: (rnd(i + 1) - 0.5) * 340,
    vy: rain ? 150 + rnd(i + 2) * 180 : -(260 + rnd(i + 2) * 190),
    x0: rnd(i + 5),
    spin: (rnd(i + 4) - 0.5) * 900,
    sway: rnd(i + 6) * 6,
  };
});
const PERKS = [
  { icon: 'swap-horizontal', label: 'Swap any meal' },
  { icon: 'flame-outline', label: 'Cook mode' },
  { icon: 'create-outline', label: 'Edit recipes' },
] as const;

export function PlusCelebration({ onDone }: { onDone: () => void }) {
  const c = useTheme();
  const { t } = useT();
  const { width, height } = useWindowDimensions();
  const dark = useColorScheme() === 'dark';
  const P = COLORS[dark ? 'dark' : 'light'];
  const size = Math.min(width * 0.72, 300);
  const k = size / 200;
  const f = size / 250;
  const still = useMemo(() => reduceMotion(), []);

  const v = useRef({
    tm: new Animated.Value(still ? STILL_AT : 0),
    level: new Animated.Value(still ? 0 : 64),
    out: new Animated.Value(1),
  }).current;
  const [fillTop, setFillTop] = useState(still ? 112 : 176);
  const [face, setFace] = useState<'idle' | 'blink' | 'cheer'>(still ? 'cheer' : 'idle');

  useEffect(() => {
    const id = v.level.addListener(({ value }) => setFillTop(112 + value));
    return () => v.level.removeListener(id);
  }, [v.level]);

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, fn: () => void) => timers.push(setTimeout(fn, ms));
    if (still) {
      at(2600, () => Animated.timing(v.out, { toValue: 0, duration: 250, useNativeDriver: true }).start(() => onDone()));
      return () => timers.forEach(clearTimeout);
    }
    Animated.timing(v.tm, { toValue: END, duration: END, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => finished && onDone());
    Animated.timing(v.level, { toValue: 0, duration: 800, delay: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: false }).start();
    at(550, haptic.tap);
    at(1000, haptic.tap);
    at(1300, () => setFace('blink'));
    at(1400, () => setFace('idle'));
    at(1900, () => {
      setFace('cheer');
      haptic.success();
    });
    at(2450, haptic.tap);
    at(3100, haptic.tap);
    return () => timers.forEach(clearTimeout);
  }, [still, v, onDone]);

  // Every curve is sampled from a function of the clock, then handed to the native driver as an interpolation.
  const a = useMemo(() => {
    const S = <T extends number | string>(fn: (ms: number) => T) => v.tm.interpolate({ inputRange: PTS, outputRange: PTS.map(fn) as number[] });
    const lift = (ms: number) => (ms < 550 ? -430 * f * (1 - Math.pow(ms / 550, 2)) : -26 * f * Math.sin(Math.PI * seg(ms, 560, 880)) - Math.abs(Math.sin((ms - 2300) / 300)) * 14 * f * dance(ms));
    const sy = (ms: number) => (ms < 550 ? 1 : 1 - 0.2 * Math.cos(seg(ms, 550, 1000) * Math.PI * 3) * (1 - seg(ms, 550, 1000)));
    const lid = (ms: number) => seg(ms, 1000, 1800);
    const ring = (from: number, to: number, max: number) => ({
      scale: S((ms) => 0.5 + max * easeOut(seg(ms, from, to))),
      opacity: S((ms) => (ms > from && ms < to ? 1 - seg(ms, from, to) * 0.4 : 0)),
    });
    return {
      scrim: S((ms) => 0.94 * seg(ms, 0, 250)),
      fade: S((ms) => 1 - seg(ms, 4750, 5150)),
      lift: S(lift),
      squishY: S(sy),
      squishX: S((ms) => 1 - (sy(ms) - 1) * 0.7),
      squishShift: S((ms) => (1 - sy(ms)) * 82 * k),
      rot: S((ms) => `${Math.sin((ms - 2300) / 150) * 5 * dance(ms)}deg`),
      shadowScale: S((ms) => (ms < 550 ? 0.35 + 0.65 * (1 - Math.abs(-430 * (1 - Math.pow(ms / 550, 2))) / 430) : 1)),
      shadowOpacity: S((ms) => (0.04 + 0.1 * (ms < 550 ? 1 - (430 * (1 - Math.pow(ms / 550, 2))) / 430 : 1)) * (1 - seg(ms, 4750, 5150))),
      ring1: ring(550, 1150, 8),
      ring2: ring(700, 1250, 6),
      raysOpacity: S((ms) => seg(ms, 600, 1000) * (1 - seg(ms, 3900, 4500)) * 0.32),
      raysScale: S((ms) => 0.3 + 0.7 * easeOut(seg(ms, 600, 1100))),
      lidX: S((ms) => keys(lid(ms), [0, 0.4, 0.78, 1], [0, 18, 0, 0]) * k),
      lidY: S((ms) => keys(lid(ms), [0, 0.4, 0.78, 1], [0, -110, -16, 0]) * k),
      lidRot: S((ms) => `${keys(lid(ms), [0, 0.4, 0.78, 1], [0, 200, 340, 360])}deg`),
      armsPop: S((ms) => (ms >= 1900 ? easeBack(seg(ms, 1900, 2350)) : 0)),
      armL: S((ms) => `${Math.sin((ms - 2300) / 150) * 14 * dance(ms)}deg`),
      armR: S((ms) => `${-Math.sin((ms - 2300) / 150) * 14 * dance(ms)}deg`),
      badgeScale: S((ms) => (ms >= 2000 ? Math.max(2.4 - 1.4 * easeBack(seg(ms, 2000, 2450)), 0.001) : 0.001)),
      badgeRot: S((ms) => `${(1 - seg(ms, 2000, 2450)) * -14}deg`),
      badgeOpacity: S((ms) => (ms >= 2000 ? 1 : 0)),
      shine: S((ms) => (-10 + 60 * seg(ms, 2450, 2800)) * k),
      underline: S((ms) => easeOut(seg(ms, 3000, 3400))),
      sub: S((ms) => seg(ms, 2900, 3300)),
      bubbles: BUBBLES.map((b) => {
        const cy = (ms: number) => 170 - (((ms * b.speed * 6 + b.off) % 80) * 1.6);
        const top = (ms: number) => 112 + 64 * (1 - easeInOut(seg(ms, 900, 1700)));
        return {
          y: S((ms) => (cy(ms) - b.r) * k),
          opacity: S((ms) => (ms > 1000 && ms < 1900 && cy(ms) > top(ms) + 4 && cy(ms) < 157 ? 0.9 : 0)),
        };
      }),
      burst: BURST.map((b) => ({
        x: S((ms) => Math.cos(b.a) * (8 + 22 * easeOut(seg(ms, 1000, 1400)) + 10 * 0.5) * k * 0.9),
        y: S((ms) => Math.sin(b.a) * (8 + 22 * easeOut(seg(ms, 1000, 1400)) + 5) * k * 0.72),
        opacity: S((ms) => (ms > 1000 && ms < 1400 ? 1 - seg(ms, 1000, 1400) * 0.8 : 0)),
      })),
      confetti: CONFETTI.map((p) => {
        const d = (ms: number) => (ms - p.from) / 1000;
        const x0 = p.rain ? p.x0 * width - (width - size) / 2 : 100 * k;
        const y0 = p.rain ? -height * 0.45 : 52 * k;
        return {
          x: S((ms) => (d(ms) < 0 ? 0 : p.rain ? x0 - 100 * k + Math.sin(d(ms) * 3 + p.sway) * 18 * f : p.vx * f * d(ms))),
          y: S((ms) => (d(ms) < 0 ? 0 : p.rain ? p.vy * f * d(ms) : (p.vy * d(ms) + 260 * d(ms) * d(ms)) * f)),
          rot: S((ms) => `${p.spin * Math.max(d(ms), 0)}deg`),
          opacity: S((ms) => (d(ms) < 0 ? 0 : 1 - seg(d(ms), 1.5, 2.3))),
          x0,
          y0,
        };
      }),
      sparks: SPARKS.map((_, i) => ({
        scale: S((ms) => {
          const from = 2050 + i * 130;
          return ms < from ? 0.001 : Math.max(easeBack(seg(ms, from, from + 450)) * (1 + 0.18 * Math.sin(ms / 160 + i * 2)) * (1 - seg(ms, 3900, 4400)), 0.001);
        }),
        rot: S((ms) => `${i * 12 + ms * 0.02}deg`),
      })),
      words: [0, 1, 2, 3].map((i) => ({
        opacity: S((ms) => easeOut(seg(ms, 2500 + i * 130, 2950 + i * 130))),
        y: S((ms) => 16 * (1 - easeOut(seg(ms, 2500 + i * 130, 2950 + i * 130)))),
      })),
      perks: PERKS.map((_, i) => ({
        opacity: S((ms) => clamp(easeBack(seg(ms, 3100 + i * 160, 3550 + i * 160)) * 1.4)),
        y: S((ms) => 18 * (1 - easeBack(seg(ms, 3100 + i * 160, 3550 + i * 160)))),
        scale: S((ms) => 0.7 + 0.3 * clamp(easeBack(seg(ms, 3100 + i * 160, 3550 + i * 160)))),
      })),
    };
  }, [v.tm, k, f, width, height, size]);

  const words = t('Welcome to Plus').split(' ');
  const rayR = size * 1.3;
  const scale = (value: Animated.AnimatedInterpolation<number>) => ({ transform: [{ scale: value }] });

  return (
    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: still ? v.out : a.fade }]}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: c.bg, opacity: a.scrim }]} />
      <View style={styles.center}>
        <View style={{ width: size, height: size }}>
          {still ? null : (
            <Animated.View style={{ position: 'absolute', left: size / 2 - rayR, top: size / 2 - rayR, width: rayR * 2, height: rayR * 2, opacity: a.raysOpacity, transform: [{ rotate: v.tm.interpolate({ inputRange: [0, END], outputRange: ['0deg', '94deg'] }) }, { scale: a.raysScale }] }}>
              <Svg width={rayR * 2} height={rayR * 2} viewBox={`${-rayR} ${-rayR} ${rayR * 2} ${rayR * 2}`}>
                {Array.from({ length: 7 }, (_, i) => (
                  <Path key={i} d={`M0 0 L${-rayR * 0.2} ${-rayR} L${rayR * 0.2} ${-rayR} Z`} fill={P.LIME} transform={`rotate(${i * 51.43})`} />
                ))}
              </Svg>
            </Animated.View>
          )}

          <Animated.View style={{ position: 'absolute', left: size * 0.2, top: size * 0.915, width: size * 0.6, height: size * 0.06, opacity: still ? 0.12 : a.shadowOpacity, transform: [{ scaleX: still ? 1 : a.shadowScale }] }}>
            <Svg width={size * 0.6} height={size * 0.06} viewBox="0 0 100 10">
              <Ellipse cx={50} cy={5} rx={50} ry={5} fill={P.INK} />
            </Svg>
          </Animated.View>
          {still
            ? null
            : [a.ring1, a.ring2].map((r, i) => (
                <Animated.View key={i} style={{ position: 'absolute', left: size / 2 - size * 0.08, top: size * 0.935 - size * 0.02, width: size * 0.16, height: size * 0.04, opacity: r.opacity, transform: [{ scale: r.scale }] }}>
                  <Svg width={size * 0.16} height={size * 0.04} viewBox="0 0 40 10">
                    <Ellipse cx={20} cy={5} rx={19} ry={4.5} fill="none" stroke={i ? P.G : P.LIME} strokeWidth={i ? 0.5 : 0.8} />
                  </Svg>
                </Animated.View>
              ))}

          <Animated.View style={{ width: size, height: size, transform: [{ translateY: still ? 0 : a.lift }] }}>
            <Animated.View style={{ width: size, height: size, transform: still ? [] : [{ translateY: 82 * k }, { rotate: a.rot }, { translateY: -82 * k }] }}>
              <Animated.View style={{ width: size, height: size, transform: still ? [] : [{ translateY: a.squishShift }, { scaleX: a.squishX }, { scaleY: a.squishY }] }}>
                <Layer size={size}>
                  <Path d="M84 156 V182 h-8 M116 156 V182 h8" fill="none" {...stroke(P, 4)} />
                  <Path d={JAR} fill={P.GLASS} />
                </Layer>
                <Layer size={size}>
                  <Defs>
                    <ClipPath id="plusjar">
                      <Path d={JAR} />
                    </ClipPath>
                  </Defs>
                  <G clipPath="url(#plusjar)">
                    <Path d={`M40 ${fillTop} Q70 ${fillTop - 7} 100 ${fillTop} T160 ${fillTop} V190 H40 Z`} fill={P.G} />
                  </G>
                </Layer>
                {still
                  ? null
                  : BUBBLES.map((b, i) => (
                      <Animated.View
                        key={i}
                        style={{ position: 'absolute', left: (b.x - b.r) * k, top: 0, width: b.r * 2 * k, height: b.r * 2 * k, borderRadius: b.r * k, backgroundColor: P.TINT, opacity: a.bubbles[i].opacity, transform: [{ translateY: a.bubbles[i].y }] }}
                      />
                    ))}
                <Layer size={size}>
                  <Path d="M64 92 v14" stroke={P.W} strokeWidth={4} strokeLinecap="round" />
                  <Path d={JAR} fill="none" {...stroke(P, 3.5)} />
                  <G opacity={0.75}>
                    <Ellipse cx={70} cy={104} rx={6.5} ry={3.8} fill={P.BLUSH} />
                    <Ellipse cx={130} cy={104} rx={6.5} ry={3.8} fill={P.BLUSH} />
                  </G>
                  {face === 'cheer' ? (
                    <>
                      <Path d="M75 94 q7 -9 14 0 M111 94 q7 -9 14 0" fill="none" {...stroke(P, 3.5)} />
                      <Path d="M90 102 Q100 120 110 102 Z" fill={P.INK} {...stroke(P, 3)} />
                      <Ellipse cx={100} cy={111} rx={4.5} ry={2.6} fill={P.BLUSH} />
                    </>
                  ) : (
                    <>
                      {face === 'blink' ? (
                        <Path d="M77 93 h10 M113 93 h10" fill="none" {...stroke(P, 3.5)} />
                      ) : (
                        <>
                          <Ellipse cx={82} cy={92} rx={5} ry={6.5} fill={P.INK} />
                          <Circle cx={83.6} cy={89.6} r={1.7} fill="#fff" />
                          <Ellipse cx={118} cy={92} rx={5} ry={6.5} fill={P.INK} />
                          <Circle cx={119.6} cy={89.6} r={1.7} fill="#fff" />
                        </>
                      )}
                      <Path d="M92 104 Q100 111 108 104" fill="none" {...stroke(P, 3.5)} />
                    </>
                  )}
                </Layer>

                <Animated.View style={[StyleSheet.absoluteFill, { transform: [{ translateY: 18 * k }, { scale: still ? 1 : a.armsPop }, { translateY: -18 * k }] }]}>
                  <Animated.View style={[StyleSheet.absoluteFill, { transform: still ? [] : [{ translateX: -45 * k }, { translateY: 18 * k }, { rotate: a.armL }, { translateX: 45 * k }, { translateY: -18 * k }] }]}>
                    <Layer size={size}>
                      <Path d="M55 118 Q38 104 32 78" fill="none" {...stroke(P, 4)} />
                      <Circle cx={32} cy={76} r={6} fill={P.W} {...stroke(P, 3)} />
                    </Layer>
                  </Animated.View>
                  <Animated.View style={[StyleSheet.absoluteFill, { transform: still ? [] : [{ translateX: 45 * k }, { translateY: 18 * k }, { rotate: a.armR }, { translateX: -45 * k }, { translateY: -18 * k }] }]}>
                    <Layer size={size}>
                      <Path d="M145 118 Q162 104 168 78" fill="none" {...stroke(P, 4)} />
                      <Circle cx={168} cy={76} r={6} fill={P.W} {...stroke(P, 3)} />
                    </Layer>
                  </Animated.View>
                </Animated.View>

                <Box size={size} box={[72, 120, 56, 30]} style={still ? undefined : { opacity: a.badgeOpacity, transform: [{ rotate: a.badgeRot }, { scale: a.badgeScale }] }}>
                  <Rect x={76} y={124} width={48} height={22} rx={6} fill={P.LIME} {...stroke(P, 3)} />
                  <SvgText x={100} y={140} textAnchor="middle" fontSize={13} fontFamily={fonts.displaySemi} fill="#13241A">
                    PLUS
                  </SvgText>
                </Box>
                {still ? null : (
                  <View pointerEvents="none" style={{ position: 'absolute', left: 76 * k, top: 124 * k, width: 48 * k, height: 22 * k, borderRadius: 6 * k, overflow: 'hidden' }}>
                    <Animated.View style={{ position: 'absolute', top: -4 * k, width: 9 * k, height: 30 * k, backgroundColor: '#fff', opacity: a.badgeOpacity.interpolate({ inputRange: [0, 1], outputRange: [0, 0.7] }), transform: [{ translateX: a.shine }, { rotate: '20deg' }] }} />
                  </View>
                )}

                <Animated.View style={{ position: 'absolute', left: 0, top: 0, width: size, height: size, transform: still ? [] : [{ translateX: a.lidX }, { translateY: a.lidY }] }}>
                  <Animated.View style={{ position: 'absolute', left: 60 * k, top: 26 * k, width: 80 * k, height: 40 * k, transform: still ? [] : [{ rotate: a.lidRot }] }}>
                    <Svg width={80 * k} height={40 * k} viewBox="60 26 80 40">
                      <Rect x={68} y={40} width={64} height={16} rx={4} fill={P.TINT} {...stroke(P, 3.5)} />
                      <Path d="M78 45 v6 M88 45 v6 M98 45 v6 M108 45 v6 M118 45 v6" fill="none" {...stroke(P, 2)} />
                      <Rect x={72} y={32} width={56} height={10} rx={4} fill={P.W} {...stroke(P, 3.5)} />
                    </Svg>
                  </Animated.View>
                </Animated.View>
              </Animated.View>
            </Animated.View>
          </Animated.View>

          {still
            ? null
            : BURST.map((b, i) => (
                <Animated.View
                  key={`b${i}`}
                  style={{ position: 'absolute', left: 100 * k - 1.5 * k, top: 52 * k - 5 * k, width: 3 * k, height: 10 * k, borderRadius: 2 * k, backgroundColor: P[b.color], opacity: a.burst[i].opacity, transform: [{ translateX: a.burst[i].x }, { translateY: a.burst[i].y }, { rotate: `${(b.a * 180) / Math.PI + 90}deg` }] }}
                />
              ))}

          {still
            ? null
            : CONFETTI.map((p, i) => {
                const w = (p.bar ? 9 : 7) * f;
                const h = (p.bar ? 4.5 : 7) * f;
                const q = a.confetti[i];
                return (
                  <Animated.View
                    key={i}
                    style={{ position: 'absolute', left: (p.rain ? 100 * k : 100 * k) - w / 2, top: (p.rain ? q.y0 : q.y0) - h / 2, width: w, height: h, borderRadius: p.bar ? 1 : w / 2, backgroundColor: P[p.color], opacity: q.opacity, transform: [{ translateX: q.x }, { translateY: q.y }, { rotate: q.rot }] }}
                  />
                );
              })}

          {SPARKS.map((s, i) => (
            <Box key={i} size={size} box={[s.x - 12, s.y - 12, 24, 24]} style={still ? { opacity: 0 } : { transform: [{ scale: a.sparks[i].scale }, { rotate: a.sparks[i].rot }] }}>
              <Path d={star(s.x, s.y, 9)} fill={P[s.fill]} {...stroke(P, 1.8)} />
            </Box>
          ))}
        </View>

        <View style={styles.copy} accessible accessibilityLiveRegion="polite" accessibilityLabel={t('Welcome to Plus. A new plan every week. Thanks for supporting Kelmi.')}>
          <View style={styles.words}>
            {words.map((word, i) => {
              const m = a.words[Math.min(i, 3)];
              const last = i === words.length - 1;
              return (
                <Animated.View key={i} style={{ opacity: still ? 1 : m.opacity, transform: [{ translateY: still ? 0 : m.y }] }}>
                  <AppText variant="title" style={styles.centerText}>{word}</AppText>
                  {last ? <Animated.View style={[styles.underline, { backgroundColor: P.LIME, transform: [{ scaleX: still ? 1 : a.underline }] }]} /> : null}
                </Animated.View>
              );
            })}
          </View>
          <Animated.View style={{ opacity: still ? 1 : a.sub }}>
            <AppText color={c.muted} style={styles.centerText}>{t('A new plan every week. Thanks for supporting Kelmi.')}</AppText>
          </Animated.View>
          <View style={styles.perks}>
            {PERKS.map((p, i) => (
              <Animated.View key={p.label} style={[styles.perk, { backgroundColor: c.tint }, still ? null : { opacity: a.perks[i].opacity, transform: [{ translateY: a.perks[i].y }, { scale: a.perks[i].scale }] }]}>
                <Ionicons name={p.icon} size={15} color={c.primaryText} />
                <AppText variant="footnote" weight="600" color={c.primaryText}>{t(p.label)}</AppText>
              </Animated.View>
            ))}
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 8 },
  copy: { gap: 8, marginTop: 4, alignItems: 'center' },
  words: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 8 },
  underline: { position: 'absolute', left: 0, right: 0, bottom: 2, height: 5, borderRadius: 3, zIndex: -1 },
  perks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6 },
  perk: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, minHeight: 30, borderRadius: radius.pill },
  centerText: { textAlign: 'center' },
});
