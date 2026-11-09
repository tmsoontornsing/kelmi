import LottieView from 'lottie-react-native';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, useColorScheme, View, type StyleProp, type ViewStyle } from 'react-native';

import { onCelebrate, type Celebration } from '../motion/celebrate';
import { reduceMotion } from '../motion';
import { PlusCelebration } from './PlusCelebration';

// Lottie animations, drawn by scripts/build-lottie.mjs (edit them there, then run it). All of them are decoration: they
// are hidden from screen readers, and with Reduce Motion on they show one still frame instead of playing.
// Names ending in a theme pair have a -dark file, because their outline would vanish on the dark background.

const FILES = {
  cooking: { light: require('../assets/lottie/cooking.json'), dark: require('../assets/lottie/cooking-dark.json'), still: 0.5 },
  coins: { light: require('../assets/lottie/coins.json'), dark: require('../assets/lottie/coins-dark.json'), still: 1 },
  zzz: { light: require('../assets/lottie/zzz.json'), dark: require('../assets/lottie/zzz-dark.json'), still: 0.55 },
  check: { light: require('../assets/lottie/check.json'), dark: require('../assets/lottie/check.json'), still: 1 },
  sparkle: { light: require('../assets/lottie/sparkle.json'), dark: require('../assets/lottie/sparkle.json'), still: 0.2 },
  confetti: { light: require('../assets/lottie/confetti.json'), dark: require('../assets/lottie/confetti.json'), still: 0 },
} as const;

export type LottieName = keyof typeof FILES;

const hidden = { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const;

// Plays a looping animation (a pot cooking, sleeping Zs) for as long as it is on screen.
export function LottieLoop({ name, size, style }: { name: LottieName; size: number; style?: StyleProp<ViewStyle> }) {
  const f = FILES[name];
  const dark = useColorScheme() === 'dark';
  const still = reduceMotion();
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]} {...hidden}>
      <LottieView
        source={dark ? f.dark : f.light}
        autoPlay={!still}
        loop
        progress={still ? f.still : undefined}
        style={styles.fill}
        resizeMode="contain"
      />
    </View>
  );
}

// Plays once each time `trigger` changes to a new truthy value, and stays blank until then. Not on first render.
export function LottieOnce({
  name,
  size,
  trigger,
  style,
}: {
  name: LottieName;
  size: number;
  trigger: unknown;
  style?: StyleProp<ViewStyle>;
}) {
  const f = FILES[name];
  const dark = useColorScheme() === 'dark';
  const first = useRef(true);
  // 0 while idle; each play gets a new number so the animation restarts from its first frame.
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (!trigger || reduceMotion()) return;
    setRun((n) => n + 1);
  }, [trigger]);

  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]} {...hidden}>
      {run > 0 ? (
        <LottieView
          key={run}
          source={dark ? f.dark : f.light}
          autoPlay
          loop={false}
          style={styles.fill}
          resizeMode="contain"
          onAnimationFinish={() => setRun(0)}
        />
      ) : null}
    </View>
  );
}

// Full-screen celebrations, mounted once in the root layout above every screen.
export function Celebrations() {
  const [running, setRunning] = useState<{ id: number; kind: Celebration }[]>([]);
  const next = useRef(0);

  useEffect(
    () =>
      onCelebrate((kind) => {
        const id = next.current++;
        setRunning((r) => [...r.slice(-1), { id, kind }]);
      }),
    [],
  );

  const done = (id: number) => setRunning((r) => r.filter((x) => x.id !== id));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} {...hidden}>
      {running.map(({ id, kind }) => (
        <View key={id} style={StyleSheet.absoluteFill}>
          {kind === 'subscribed' ? (
            <PlusCelebration onDone={() => done(id)} />
          ) : (
            <LottieView source={FILES.confetti.light} autoPlay loop={false} resizeMode="cover" style={styles.fill} onAnimationFinish={() => done(id)} />
          )}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { width: '100%', height: '100%' },
});
