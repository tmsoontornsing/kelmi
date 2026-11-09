import Ionicons from '@expo/vector-icons/Ionicons';
import { useKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { PrimaryButton, TextButton } from '../../components/Buttons';
import { ProgressBar } from '../../components/Controls';
import { Mascot } from '../../components/Mascot';
import { type RecipeView } from '../../data/mock';
import { useT } from '../../i18n';
import { clock, parseTimers } from '../../lib/cook';
import { onDeviceUnlocked } from '../../lib/flags';
import { cancelTimerAlert, scheduleTimerAlert } from '../../lib/timerAlert';
import { animateLayout, haptic, PressableScale, reduceMotion } from '../../motion';
import { celebrate } from '../../motion/celebrate';
import { useApp } from '../../state/AppState';
import { fonts, radius, space, useTheme } from '../../theme';

type Timer = { id: string; label: string; endsAt: number; alert?: string | null };

// Cook mode: one step at a time in large type, the screen kept awake, a timer for any time a step mentions, and the ingredients
// one tap away. Timers run while Kelmi is open: they buzz the phone and show on screen, but cannot ring if the app is closed.
export default function Cook() {
  const c = useTheme();
  const app = useApp();
  const { t, tn, tx, line } = useT();
  const { id, slot } = useLocalSearchParams<{ id: string; slot?: string }>();
  const slotIndex = slot !== undefined && Number.isInteger(Number(slot)) ? Number(slot) : undefined;
  const planned = slotIndex !== undefined ? app.plan[slotIndex] : undefined;
  const recipeId = planned?.id ?? id;
  useKeepAwake();
  // While Plus is on, Cook mode is part of it, so a free user who arrives by a link is sent to what Plus adds.
  const allowed = onDeviceUnlocked(app.subscribed);
  useEffect(() => {
    if (!allowed) router.replace('/plus');
  }, [allowed]);

  const [view, setView] = useState<RecipeView | null | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    app
      .getRecipe(recipeId, slotIndex)
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView(null));
    return () => {
      cancelled = true;
    };
  }, [recipeId, slotIndex, app.people]);

  const detail = view?.detail ?? undefined;
  const steps = detail?.steps ?? [];
  const [index, setIndex] = useState(0);
  const [showIngredients, setShowIngredients] = useState(false);
  const [gotten, setGotten] = useState<Record<string, boolean>>({});

  // Timers started in any step keep running as the cook moves on.
  const [timers, setTimers] = useState<Timer[]>([]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (timers.length === 0) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [timers.length]);
  const fired = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const tm of timers) {
      if (now >= tm.endsAt && !fired.current.has(tm.id)) {
        fired.current.add(tm.id);
        // A few pulses, since one buzz is easy to miss with a pan in the other hand.
        haptic.success();
        setTimeout(haptic.success, 700);
        setTimeout(haptic.success, 1400);
      }
    }
  }, [now, timers]);

  const stepTimers = useMemo(() => (steps[index] ? parseTimers(steps[index]) : []), [steps, index]);
  const startTimer = (seconds: number, label: string) => {
    haptic.tap();
    animateLayout();
    const started = Date.now();
    setNow(started);
    const id = `${started}-${seconds}`;
    setTimers((l) => [...l, { id, label, endsAt: started + seconds * 1000 }]);
    scheduleTimerAlert(seconds, t('Time’s up'), t('{label} timer is done', { label })).then((alert) =>
      setTimers((l) => (l.some((x) => x.id === id) ? l.map((x) => (x.id === id ? { ...x, alert } : x)) : (cancelTimerAlert(alert), l))),
    );
  };
  const stopTimer = (tid: string) => {
    animateLayout();
    cancelTimerAlert(timers.find((x) => x.id === tid)?.alert);
    setTimers((l) => l.filter((x) => x.id !== tid));
  };

  // The step slides in from the side you are heading, so Next and Back feel like moving along the recipe.
  const slide = useRef(new Animated.Value(1)).current;
  const dir = useRef(1);
  useEffect(() => {
    if (reduceMotion()) return;
    slide.setValue(0);
    Animated.timing(slide, { toValue: 1, duration: 280, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [index, slide]);

  const last = steps.length > 0 && index === steps.length - 1;
  const go = (to: number) => {
    haptic.select();
    dir.current = to >= index ? 1 : -1;
    setIndex(Math.max(0, Math.min(steps.length - 1, to)));
  };
  const finish = () => {
    haptic.success();
    celebrate('confetti');
    router.back();
  };
  const close = () => {
    const running = timers.some((tm) => now < tm.endsAt && !tm.alert);
    if (!running) return router.back();
    Alert.alert(t('Leave Cook mode?'), t('Your timers will stop if you leave.'), [
      { text: t('Keep cooking'), style: 'cancel' },
      { text: t('Leave'), style: 'destructive', onPress: () => router.back() },
    ]);
  };

  if (!allowed) return null;
  if (view === undefined) return <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} />;
  if (!detail || steps.length === 0) {
    return (
      <SafeAreaView style={[styles.root, styles.empty, { backgroundColor: c.bg }]}>
        <Mascot pose="oops" size={110} decorative />
        <AppText variant="title" style={styles.center}>{t('No steps for this recipe')}</AppText>
        <TextButton label={t('Back')} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const title = tx(planned?.name ?? view?.meal.name ?? '');
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('Close Cook mode')} onPress={close} hitSlop={10} style={styles.close}>
          <Ionicons name="close" size={26} color={c.text} />
        </Pressable>
        <View style={styles.flex}>
          <AppText variant="footnote" numberOfLines={1}>{title}</AppText>
          <AppText variant="headline" accessibilityLiveRegion="polite">{t('Step {n} of {total}', { n: index + 1, total: steps.length })}</AppText>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showIngredients }}
          onPress={() => {
            haptic.select();
            animateLayout();
            setShowIngredients((v) => !v);
          }}
          style={[styles.ingredientsBtn, { backgroundColor: showIngredients ? c.primary : c.tint }]}
        >
          <Ionicons name="list" size={18} color={showIngredients ? c.onPrimary : c.primaryText} />
          <AppText variant="subhead" weight="600" color={showIngredients ? c.onPrimary : c.primaryText}>{t('Ingredients')}</AppText>
        </Pressable>
      </View>
      <View style={styles.bar}>
        <ProgressBar value={index + 1} max={steps.length} label={t('Step {n} of {total}', { n: index + 1, total: steps.length })} />
      </View>

      {timers.length > 0 ? (
        <View style={styles.timers}>
          {timers.map((tm) => {
            const left = (tm.endsAt - now) / 1000;
            const done = left <= 0;
            return (
              <View key={tm.id} style={[styles.timer, { backgroundColor: done ? c.warnBg : c.tint }]} accessibilityRole="timer">
                <Ionicons name={done ? 'alarm' : 'timer-outline'} size={20} color={done ? c.warn : c.primaryText} />
                <AppText weight="700" color={done ? c.warn : c.text} style={styles.timerClock}>{done ? t('Time’s up') : clock(left)}</AppText>
                <AppText variant="footnote" style={styles.flex} numberOfLines={1}>{tm.label}</AppText>
                <TextButton label={done ? t('Dismiss') : t('Stop')} onPress={() => stopTimer(tm.id)} color={done ? c.warn : c.muted} />
              </View>
            );
          })}
        </View>
      ) : null}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {showIngredients ? (
          <View style={[styles.panel, { backgroundColor: c.card }]}>
            <AppText variant="headline" accessibilityRole="header">{t('Ingredients for {n}', { n: detail.serves })}</AppText>
            {detail.ingredients.map((ing) => {
              const on = !!gotten[ing.name];
              return (
                <Pressable
                  key={ing.name}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => {
                    haptic.tap();
                    setGotten((g) => ({ ...g, [ing.name]: !g[ing.name] }));
                  }}
                  style={styles.ingRow}
                >
                  <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? c.primary : c.control} />
                  <AppText style={[styles.flex, on && styles.struck]} color={on ? c.muted : c.text}>{line(ing.name)}</AppText>
                </Pressable>
              );
            })}
            <TextButton
              label={t('Back to the step')}
              onPress={() => {
                animateLayout();
                setShowIngredients(false);
              }}
            />
          </View>
        ) : (
          <>
            <Animated.View style={{ opacity: slide, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [36 * dir.current, 0] }) }] }}>
              <AppText style={styles.step} accessibilityLiveRegion="polite">{tx(steps[index])}</AppText>
            </Animated.View>
            {stepTimers.map((st) => (
              <PressableScale
                key={st.seconds}
                accessibilityRole="button"
                accessibilityLabel={t('Start a {time} timer', { time: st.label })}
                to={0.97}
                onPress={() => startTimer(st.seconds, st.label)}
                style={[styles.startTimer, { borderColor: c.primary }]}
              >
                <Ionicons name="timer-outline" size={22} color={c.primaryText} />
                <AppText weight="600" color={c.primaryText}>{t('Start {time} timer', { time: clock(st.seconds) })}</AppText>
              </PressableScale>
            ))}
            {last ? (
              <AppText variant="subhead" style={styles.tip}>
                {tn(detail.serves, 'Made {n} serving. Anything left over can go in Leftovers on the Pantry tab.', 'Made {n} servings. Anything left over can go in Leftovers on the Pantry tab.')}
              </AppText>
            ) : null}
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Previous step')}
          accessibilityState={{ disabled: index === 0 }}
          disabled={index === 0}
          onPress={() => go(index - 1)}
          style={[styles.prev, { backgroundColor: c.tint, opacity: index === 0 ? 0.35 : 1 }]}
        >
          <Ionicons name="chevron-back" size={28} color={c.primaryText} />
        </Pressable>
        <View style={styles.flex}>
          <PrimaryButton label={last ? t('Done cooking') : t('Next step')} icon={last ? 'checkmark' : 'arrow-forward'} pressScale={0.94} onPress={() => (last ? finish() : go(index + 1))} feedback="none" />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 32 },
  center: { textAlign: 'center' },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.gutter, paddingTop: 8 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginLeft: -8 },
  ingredientsBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bar: { paddingHorizontal: space.gutter, paddingTop: 10 },
  timers: { paddingHorizontal: space.gutter, paddingTop: 10, gap: 8 },
  timer: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 6, minHeight: 52, borderRadius: radius.control },
  timerClock: { fontVariant: ['tabular-nums'], fontSize: 20 },
  content: { paddingHorizontal: space.gutter, paddingTop: 28, paddingBottom: 20, gap: 20, flexGrow: 1 },
  step: { fontFamily: fonts.displaySemi, fontSize: 30, lineHeight: 40, letterSpacing: -0.4 },
  startTimer: { minHeight: 56, borderRadius: radius.control, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  tip: { marginTop: 4 },
  panel: { padding: 16, borderRadius: radius.card, gap: 4 },
  ingRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48 },
  struck: { textDecorationLine: 'line-through' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.gutter, paddingBottom: 8, paddingTop: 8 },
  prev: { width: 60, height: 54, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center' },
});
