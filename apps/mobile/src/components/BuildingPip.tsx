import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { useT } from '../i18n';
import { reduceMotion } from '../motion';
import { space, useTheme } from '../theme';
import { AppText } from './AppText';
import { Mascot, type MascotPose } from './Mascot';

const STEP_MS = 1700;

// What Pip does while Kelmi builds a grocery list. Each step is a pose and a line about the work that is really happening,
// so the wait reads as progress. It moves on every STEP_MS and rests on the last pose until the list is ready.
// Covers the list it sits over. Reduce Motion shows the poses without the fade.
export function BuildingPip() {
  const c = useTheme();
  const { t } = useT();
  const steps: { pose: MascotPose; text: string }[] = [
    { pose: 'shop', text: t('Gathering your meals…') },
    { pose: 'read', text: t('Checking allergies and diet…') },
    { pose: 'think', text: t('Adding up what you need…') },
    { pose: 'save', text: t('Leaving off your pantry items…') },
    { pose: 'cheer', text: t('Almost there…') },
  ];

  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= steps.length - 1) return;
    const id = setTimeout(() => setI((n) => n + 1), STEP_MS);
    return () => clearTimeout(id);
  }, [i, steps.length]);

  // The screen fades in once, and the line fades in each time it changes.
  const enter = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  const line = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.timing(enter, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [enter]);
  useEffect(() => {
    if (reduceMotion()) return;
    line.setValue(0);
    Animated.timing(line, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [i, line]);

  const step = steps[i];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: c.bg, opacity: enter }]}>
      <Mascot pose={step.pose} size={210} decorative />
      <Animated.View style={{ opacity: line }}>
        <AppText variant="headline" style={styles.text} accessibilityLiveRegion="polite">
          {step.text}
        </AppText>
      </Animated.View>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {steps.map((_, n) => (
          <View key={n} style={[styles.dot, { backgroundColor: n <= i ? c.primary : c.track }]} />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', justifyContent: 'center', gap: 20, paddingHorizontal: space.gutter },
  text: { textAlign: 'center' },
  dots: { flexDirection: 'row', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
