import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, type ComponentProps, type ReactNode } from 'react';
import { Animated, PanResponder, StyleSheet, View } from 'react-native';

import { haptic, reduceMotion } from '../motion';
import { AppText } from './AppText';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type SwipeAction = {
  label: string;
  icon: IconName;
  // Fill behind the row and the colour of the icon and label on it.
  background: string;
  foreground: string;
  onTrigger: () => void;
};

const THRESHOLD = 84;

// A row you can drag sideways. `start` is revealed by dragging right, `end` by dragging left.
// Pulling past the threshold buzzes once and runs the action on release; otherwise the row springs back.
// Rows keep their regular buttons too, so the gesture is a shortcut and never the only way.
export function SwipeRow({
  children,
  background,
  start,
  end,
}: {
  children: ReactNode;
  // The row's own fill, so it covers the action while at rest.
  background: string;
  start?: SwipeAction;
  end?: SwipeAction;
}) {
  const x = useRef(new Animated.Value(0)).current;
  const armed = useRef(false);
  const latest = useRef({ start, end });
  latest.current = { start, end };

  const settle = () => {
    armed.current = false;
    if (reduceMotion()) x.setValue(0);
    else Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 7 }).start();
  };

  const pan = useRef(
    PanResponder.create({
      // Only claim clearly horizontal drags toward a side that has an action, so vertical scrolling stays smooth.
      onMoveShouldSetPanResponder: (_, g) => {
        const { start: s, end: e } = latest.current;
        const horizontal = Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6;
        return horizontal && ((g.dx > 0 && !!s) || (g.dx < 0 && !!e));
      },
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const { start: s, end: e } = latest.current;
        const allowed = g.dx > 0 ? !!s : !!e;
        const raw = allowed ? g.dx : 0;
        // Resist after the threshold so it feels like a pull against a spring.
        const past = Math.max(0, Math.abs(raw) - THRESHOLD);
        const eased = Math.sign(raw) * (Math.min(Math.abs(raw), THRESHOLD) + past * 0.35);
        x.setValue(eased);
        const nowArmed = Math.abs(raw) >= THRESHOLD;
        if (nowArmed && !armed.current) haptic.select();
        armed.current = nowArmed;
      },
      onPanResponderRelease: (_, g) => {
        const { start: s, end: e } = latest.current;
        const action = armed.current ? (g.dx > 0 ? s : e) : undefined;
        settle();
        if (action) {
          haptic.tap();
          action.onTrigger();
        }
      },
      onPanResponderTerminate: settle,
    }),
  ).current;

  const reveal = (side: 'start' | 'end', action?: SwipeAction) => {
    if (!action) return null;
    const input = [-THRESHOLD, -THRESHOLD / 2, 0, THRESHOLD / 2, THRESHOLD];
    const opacity = x.interpolate({ inputRange: input, outputRange: side === 'start' ? [0, 0, 0, 0.4, 1] : [1, 0.4, 0, 0, 0], extrapolate: 'clamp' });
    const scale = x.interpolate({ inputRange: input, outputRange: side === 'start' ? [0.7, 0.7, 0.7, 0.85, 1.08] : [1.08, 0.85, 0.7, 0.7, 0.7], extrapolate: 'clamp' });
    return (
      <View
        pointerEvents="none"
        style={[styles.action, { backgroundColor: action.background, justifyContent: 'center', alignItems: side === 'start' ? 'flex-start' : 'flex-end' }]}
      >
        <Animated.View style={[styles.actionInner, { opacity, transform: [{ scale }] }]}>
          <Ionicons name={action.icon} size={22} color={action.foreground} />
          <AppText variant="footnote" weight="700" color={action.foreground}>{action.label}</AppText>
        </Animated.View>
      </View>
    );
  };

  return (
    <View style={styles.clip}>
      {reveal('start', start)}
      {reveal('end', end)}
      <Animated.View {...pan.panHandlers} style={{ backgroundColor: background, transform: [{ translateX: x }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  action: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  actionInner: { width: THRESHOLD, alignItems: 'center', gap: 2 },
});
