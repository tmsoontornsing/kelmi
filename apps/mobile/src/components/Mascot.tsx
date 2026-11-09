import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, Pressable, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useT, type Translator } from '../i18n';
import { haptic, reduceMotion } from '../motion';
import { MASCOT_POSES, type MascotPose } from './mascotPoses.generated';
import type { MascotAnim, MascotLayer, MascotPoseSpec } from './mascotTypes';

export type { MascotPose };
export const MASCOT_NAME = 'Pip';

// The generated drawings use these color tokens. Dark mode flips the ink to a light line and the paper fills to the surface color.
const PALETTE = {
  light: { INK: '#13241A', G: '#3DAA84', TINT: '#CFE8DA', GLASS: '#E8F3EC', BLUSH: '#F4AE9C', W: '#FFFFFF' },
  dark: { INK: '#E8F1EB', G: '#5CC99A', TINT: '#2C4A3A', GLASS: '#1F3328', BLUSH: '#C97F70', W: '#17231C' },
} as const;
type Colors = (typeof PALETTE)['light' | 'dark'];

// What a screen reader hears when a screen passes no `label`: Pip's name and the pose, as one translated phrase.
const poseLabels = (t: Translator['t']): Record<MascotPose, string> => ({
  wave: t('Pip, waving'),
  think: t('Pip, thinking'),
  cook: t('Pip, cooking'),
  shop: t('Pip, shopping'),
  cheer: t('Pip, cheering'),
  oops: t('Pip, oops'),
  sleep: t('Pip, napping'),
  peek: t('Pip, peeking'),
  love: t('Pip, loving it'),
  yum: t('Pip, yum'),
  save: t('Pip, saving'),
  point: t('Pip, pointing'),
  read: t('Pip, reading'),
});

// Pip, Kelmi's mason jar. One pose per moment: pick the one that matches what the screen is saying.
// Each pose has its own idle loop (a wave, a hop, steam, blinking); Reduce Motion or animate={false} shows it still.
// Pass `label` when the pose adds meaning a screen reader needs, or `decorative` when nearby text already says it.
// `tappable` lets people poke Pip: a little jump and squish, with a tap of haptics. It is a bonus, never the only way to do anything.
export function Mascot({
  pose,
  size = 160,
  label,
  decorative = false,
  animate = true,
  tappable = false,
  style,
}: {
  pose: MascotPose;
  size?: number;
  label?: string;
  decorative?: boolean;
  animate?: boolean;
  tappable?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const spec: MascotPoseSpec = MASCOT_POSES[pose];
  const { t } = useT();
  const colors = PALETTE[useColorScheme() === 'dark' ? 'dark' : 'light'];
  const on = animate && !reduceMotion();

  // Springs in when it first appears and whenever the pose changes.
  const pop = useRef(new Animated.Value(on ? 0 : 1)).current;
  useEffect(() => {
    if (!on) {
      pop.setValue(1);
      return;
    }
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 170, mass: 0.8 }).start();
  }, [pose, on, pop]);

  // A poke: shoots up, then lands with a couple of wobbles.
  const boing = useRef(new Animated.Value(0)).current;
  const poke = () => {
    haptic.tap();
    if (!on) return;
    boing.stopAnimation();
    boing.setValue(0);
    Animated.sequence([
      Animated.timing(boing, { toValue: 1, duration: 150, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(boing, { toValue: 0, useNativeDriver: true, damping: 5, stiffness: 240, mass: 0.7 }),
    ]).start();
  };

  const layer = (l: MascotLayer, i: number) => (
    <Layer key={`${pose}-${i}`} layer={l} size={size} on={on} colors={colors} />
  );

  const body = (
    <Animated.View
      accessible={!decorative}
      accessibilityRole={decorative ? undefined : 'image'}
      accessibilityLabel={decorative ? undefined : (label ?? poseLabels(t)[pose])}
      accessibilityElementsHidden={decorative}
      importantForAccessibility={decorative ? 'no-hide-descendants' : 'auto'}
      pointerEvents="none"
      style={[
        { width: size, height: size },
        {
          opacity: pop,
          transform: [
            { scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
            { translateY: boing.interpolate({ inputRange: [0, 1], outputRange: [0, -size * 0.14] }) },
            { scaleY: boing.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] }) },
            { scaleX: boing.interpolate({ inputRange: [0, 1], outputRange: [1, 0.95] }) },
          ],
        },
      ]}
    >
      <Moving key={pose} anim={spec.motion} size={size} on={on}>
        {spec.layers.filter((l) => !l.fixed).map(layer)}
      </Moving>
      {spec.layers.filter((l) => l.fixed).map(layer)}
    </Animated.View>
  );

  // The caller's style lands on a wrapper so margins and absolute positions work the same tappable or not.
  return tappable ? (
    <Pressable accessible={false} onPress={poke} hitSlop={6} style={style}>
      {body}
    </Pressable>
  ) : (
    <View style={style}>{body}</View>
  );
}

function Moving({ anim, size, on, children }: { anim?: MascotAnim; size: number; on: boolean; children: ReactNode }) {
  const motion = useMotion(anim, size, on);
  return <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, motion]}>{children}</Animated.View>;
}

function Layer({ layer, size, on, colors }: { layer: MascotLayer; size: number; on: boolean; colors: Colors }) {
  const xml = useMemo(
    () => layer.svg.replace(/__([A-Z]+)__/g, (_, k: keyof Colors) => colors[k]),
    [layer.svg, colors],
  );
  const motion = useMotion(layer.anim, size, on);
  return (
    <Animated.View style={[{ position: 'absolute', left: 0, top: 0, width: size, height: size }, motion]}>
      <SvgXml xml={xml} width={size} height={size} />
    </Animated.View>
  );
}

// ---- Motion

const FEET: [number, number] = [100, 182];
// Drawing units run 0 to 200, so a point's percentage is half its coordinate.
const origin = ([x, y]: [number, number]) => `${x / 2}% ${y / 2}%`;
const ease = Easing.inOut(Easing.sin);

// Where each kind sits when it is not moving: centered for swings, mid-way for things that fade, landed for rise.
const rest = (kind: MascotAnim['kind']) => (kind === 'float' || kind === 'drip' ? 0.5 : kind === 'rise' ? 1 : 0);

function loopFor(anim: MascotAnim, t: Animated.Value): Animated.CompositeAnimation {
  const to = (toValue: number, duration: number, easing = ease) =>
    Animated.timing(t, { toValue, duration, easing, useNativeDriver: true });
  const yoyo = (ms: number) => Animated.loop(Animated.sequence([to(1, ms / 2), to(0, ms / 2)]));
  switch (anim.kind) {
    case 'swing':
    case 'sway':
      return Animated.loop(Animated.sequence([to(1, anim.ms / 4), to(-1, anim.ms / 2), to(0, anim.ms / 4)]));
    case 'bob':
    case 'nudge':
    case 'pulse':
    case 'breathe':
    case 'twinkle':
      return yoyo(anim.ms);
    case 'flip':
      return Animated.loop(Animated.sequence([to(1, anim.ms * 0.4), Animated.delay(anim.ms * 0.6)]));
    case 'blink':
      return Animated.loop(Animated.sequence([Animated.delay(2600), to(1, 90), to(0, 120)]));
    case 'float':
    case 'drip':
      return Animated.loop(to(1, anim.ms, Easing.linear));
    case 'hop':
      return Animated.loop(
        Animated.sequence([to(1, 220, Easing.out(Easing.quad)), to(0, 260, Easing.in(Easing.quad)), Animated.delay(anim.ms)]),
      );
    case 'shake':
      return Animated.loop(
        Animated.sequence([to(1, 60), to(-1, 60), to(1, 60), to(-1, 60), to(0, 60), Animated.delay(anim.ms)]),
      );
    case 'rise':
      return Animated.spring(t, { toValue: 1, useNativeDriver: true, damping: 14, stiffness: 120, mass: 0.9 });
  }
}

function styleFor(anim: MascotAnim, t: Animated.Value, u: number) {
  const range = (outputRange: number[] | string[], inputRange = [0, 1]) => t.interpolate({ inputRange, outputRange } as never);
  switch (anim.kind) {
    case 'swing':
      return { transformOrigin: origin(anim.origin), transform: [{ rotate: range([`-${anim.deg}deg`, `${anim.deg}deg`], [-1, 1]) }] };
    case 'sway':
      return { transformOrigin: origin(FEET), transform: [{ rotate: range([`-${anim.deg}deg`, `${anim.deg}deg`], [-1, 1]) }] };
    case 'bob':
      return { transform: [{ translateY: range([0, -anim.dy * u]) }] };
    case 'nudge':
      return { transform: [{ translateX: range([0, anim.dx * u]) }] };
    case 'pulse':
      return { transformOrigin: origin(anim.origin), transform: [{ scale: range([1, anim.scale]) }] };
    case 'breathe':
      return { transformOrigin: origin(FEET), transform: [{ scale: range([1, anim.scale]) }] };
    case 'flip':
      return { transformOrigin: origin(anim.origin), transform: [{ scaleX: range([1, 0.08, 1], [0, 0.5, 1]) }] };
    case 'blink':
      return { transformOrigin: origin(anim.origin), transform: [{ scaleY: range([1, 0.1]) }] };
    case 'float':
      return { opacity: range([0, 1, 1, 0], [0, 0.2, 0.75, 1]), transform: [{ translateY: range([0, -anim.dy * u]) }] };
    case 'drip':
      return { opacity: range([0, 1, 1, 0], [0, 0.15, 0.8, 1]), transform: [{ translateY: range([0, anim.dy * u]) }] };
    case 'twinkle':
      return { opacity: range([0.25, 1]) };
    case 'hop':
      return { transform: [{ translateY: range([0, -anim.dy * u]) }] };
    case 'shake':
      return { transform: [{ translateX: range([-anim.dx * u, anim.dx * u], [-1, 1]) }] };
    case 'rise':
      return { transform: [{ translateY: range([anim.dy * u, 0]) }] };
  }
}

function useMotion(anim: MascotAnim | undefined, size: number, on: boolean) {
  const t = useRef(new Animated.Value(anim && !on ? rest(anim.kind) : 0)).current;
  useEffect(() => {
    if (!anim) return;
    if (!on) {
      t.setValue(rest(anim.kind));
      return;
    }
    t.setValue(0);
    const loop = loopFor(anim, t);
    loop.start();
    return () => loop.stop();
  }, [anim, on, t]);
  return useMemo(() => (anim ? styleFor(anim, t, size / 200) : undefined), [anim, t, size]);
}
