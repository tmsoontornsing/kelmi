import { useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, PanResponder, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { useT } from '../i18n';
import { haptic, reduceMotion } from '../motion';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';

// The week as a row of day cards, one on screen at a time. A sideways drag moves the card with the finger; let go past
// halfway and the card slides off to that side while the next day slides in from the other side, like a carousel.
// Swiping right goes back a day. At either end the drag resists and springs back. Day chips above jump to a day, which
// is also the way in for VoiceOver users.
export function DayDeck({
  days,
  initial = 0,
  todayIndex,
}: {
  days: { short: string; long: string; card: ReactNode }[];
  initial?: number;
  todayIndex: number;
}) {
  const c = useTheme();
  const { t, tx } = useT();
  const { width } = useWindowDimensions();
  const [index, setIndex] = useState(Math.min(Math.max(initial, 0), days.length - 1));
  // The day that is sliding out while the next one slides in. Null when the deck is still.
  // While a slide runs: the day going out and the day coming in. Null when the deck is still.
  const [slide, setSlide] = useState<{ from: number; to: number } | null>(null);
  // The card on screen follows the finger (`x`). During a slide the card coming in is `enter`, one screen away.
  const x = useRef(new Animated.Value(0)).current;
  const enter = useRef(new Animated.Value(0)).current;
  // Height of the current card, held while two cards are on screen so the deck does not jump.
  const [height, setHeight] = useState<number | null>(null);
  const busy = useRef(false);
  // The pan handler is built once, so it reads the live values through a ref.
  const live = useRef({ index, count: days.length, width });
  live.current = { index, count: days.length, width };

  // Slides from the current day to `next`. `dir` is -1 for a forward day (left) and 1 for a backward one (right).
  const goTo = (next: number, dir: -1 | 1) => {
    const { index: from, count, width: w } = live.current;
    if (next === from || next < 0 || next >= count || busy.current) return;
    haptic.select();
    if (reduceMotion()) {
      setIndex(next);
      x.setValue(0);
      return;
    }
    busy.current = true;
    // The new card waits one screen away on the side it enters from. The old card carries on from wherever the finger left it.
    enter.setValue(-dir * w);
    setSlide({ from, to: next });
    const out = Animated.timing(x, { toValue: dir * w, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    const inn = Animated.timing(enter, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true });
    Animated.parallel([out, inn]).start(() => {
      setIndex(next);
      setSlide(null);
      x.setValue(0);
      enter.setValue(0);
      busy.current = false;
    });
  };

  const pan = useRef(
    PanResponder.create({
      // Only a clearly sideways drag takes the touch, so taps on buttons and vertical scrolling still work.
      onMoveShouldSetPanResponder: (_, g) => !busy.current && Math.abs(g.dx) > 12 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => {
        const { index: i, count } = live.current;
        const blocked = (g.dx > 0 && i === 0) || (g.dx < 0 && i === count - 1);
        x.setValue(blocked ? g.dx * 0.25 : g.dx);
      },
      onPanResponderRelease: (_, g) => {
        const { index: i, count, width: w } = live.current;
        const far = Math.abs(g.dx) > w * 0.28 || Math.abs(g.vx) > 0.6;
        const forward = g.dx < 0;
        const next = forward ? i + 1 : i - 1;
        if (far && next >= 0 && next < count) {
          goTo(next, forward ? -1 : 1);
        } else {
          Animated.spring(x, { toValue: 0, useNativeDriver: true, damping: 18, stiffness: 240 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(x, { toValue: 0, useNativeDriver: true }).start();
      },
    }),
  ).current;

  const onChip = (i: number) => {
    if (i === index) return;
    goTo(i, i > index ? -1 : 1);
  };

  return (
    <View>
      <View accessibilityRole="tablist" style={styles.chips}>
        {days.map((d, i) => {
          const on = i === index;
          return (
            <Pressable
              key={d.long}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={tx(d.long)}
              onPress={() => onChip(i)}
              hitSlop={4}
              style={[styles.chip, { backgroundColor: on ? c.primary : c.card, borderColor: on ? c.primary : c.line }]}
            >
              <AppText variant="footnote" weight="700" color={on ? c.onPrimary : c.text}>{tx(d.short)}</AppText>
              {i === todayIndex ? <View style={[styles.dot, { backgroundColor: on ? c.onPrimary : c.primary }]} /> : null}
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.deck, slide && height ? { height } : null]} {...pan.panHandlers}>
        {slide ? (
          <>
            <Animated.View style={[styles.page, { transform: [{ translateX: x }] }]}>{days[slide.from].card}</Animated.View>
            <Animated.View style={[styles.page, styles.pinned, { transform: [{ translateX: enter }] }]}>{days[slide.to].card}</Animated.View>
          </>
        ) : (
          <View
            style={styles.page}
            onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
          >
            <Animated.View style={{ transform: [{ translateX: x }] }}>{days[index].card}</Animated.View>
          </View>
        )}
      </View>

      <AppText variant="footnote" style={styles.hint}>
        {t('Swipe the card to see the next or the previous day')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  chip: { flex: 1, minHeight: 40, borderRadius: radius.pill, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dot: { width: 5, height: 5, borderRadius: 3, position: 'absolute', bottom: 4 },
  deck: { overflow: 'hidden', paddingBottom: 18 },
  page: { width: '100%' },
  // Both cards sit in the same place while one slides out and the other in.
  pinned: { position: 'absolute', top: 0, left: 0, right: 0 },
  hint: { textAlign: 'center' },
});
