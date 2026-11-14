import Ionicons from '@expo/vector-icons/Ionicons';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Alert, Animated, Easing, Platform, Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { IconButton, PrimaryButton, TextButton } from '../components/Buttons';
import { Mascot } from '../components/Mascot';
import { money, PLANS } from '../data/mock';
import { PLUS_ENABLED } from '../lib/flags';
import { isPlusFeature, plusPitch } from '../lib/plusFeatures';
import * as purchases from '../lib/purchases';
import { useT } from '../i18n';
import { track, useExperiment } from '../lib/experiments';
import { animateLayout, haptic, reduceMotion, Reveal, useCountUp } from '../motion';
import { celebrate } from '../motion/celebrate';
import { modalEdges } from '../navigation';
import { useApp } from '../state/AppState';
import { fonts, radius, space, useTheme } from '../theme';

const price = (n: number) => (Number.isInteger(n) ? `$${n}` : money(n));

// Shown after sign-up and from Settings. Presented as a page sheet: close it to stay on the free plan.
// Purchases go through RevenueCat (lib/purchases.ts). Prices come from the store so they match the user's currency;
// the numbers in PLANS are only shown until the store answers. Without RevenueCat keys, only a dev build fakes a purchase.
// Plus is hidden until billing works (see lib/flags.ts), so a deep link or an old shortcut lands back on the app.
export default function Paywall() {
  if (!PLUS_ENABLED) return <Redirect href="/" />;
  return <PaywallScreen />;
}

function PaywallScreen() {
  const c = useTheme();
  const app = useApp();
  const [plan, setPlan] = useState<(typeof PLANS)[number]['id']>('annual');
  // A/B test: which plan starts selected. The person can still pick either.
  const startPlan = useExperiment('paywall_default_plan');
  useEffect(() => {
    if (!startPlan) return;
    setPlan(startPlan);
    track('paywall_default_plan', startPlan, 'paywall_viewed');
  }, [startPlan]);
  const chosen = PLANS.find((p) => p.id === plan) ?? PLANS[0];
  const { t, tn, tx } = useT();
  // Opened from a locked spot: the header speaks to that one feature, Pip takes a matching pose, and its line is highlighted.
  const { feature } = useLocalSearchParams<{ feature?: string }>();
  const pitch = isPlusFeature(feature) ? plusPitch(feature) : null;

  const [packages, setPackages] = useState<Awaited<ReturnType<typeof purchases.loadPackages>>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    purchases.loadPackages().then(setPackages).catch(() => {});
  }, []);
  // The store's own price string ("$59.99", "59,99 €") once loaded.
  const priceOf = (p: (typeof PLANS)[number]) => packages[p.id]?.product.priceString ?? price(p.price);

  // A free trial, when the store offers one on this plan: the length is the store's, so it can change without an update.
  const trial = purchases.freeTrialOf(packages[plan]);
  const trialText = trial
    ? trial.unit === 'day'
      ? tn(trial.n, '{n} day', '{n} days')
      : trial.unit === 'week'
        ? tn(trial.n, '{n} week', '{n} weeks')
        : trial.unit === 'month'
          ? tn(trial.n, '{n} month', '{n} months')
          : tn(trial.n, '{n} year', '{n} years')
    : '';

  const finish = () => {
    router.back();
    // Wait for the sheet to finish closing so the celebration lands on the screen underneath it.
    setTimeout(() => celebrate('subscribed'), 350);
  };

  const subscribe = async () => {
    if (busy) return;
    if (startPlan) track('paywall_default_plan', startPlan, `subscribe_tapped_${plan}`);
    const pkg = packages[plan];
    if (!pkg) {
      if (__DEV__ && !purchases.isConfigured()) {
        app.subscribe();
        finish();
        return;
      }
      Alert.alert(t('Purchases are not available'), t('Kelmi could not reach the store. Check your connection and try again.'));
      return;
    }
    setBusy(true);
    try {
      if (await purchases.buy(pkg)) {
        app.subscribe();
        finish();
      }
    } catch (e) {
      Alert.alert(t('Purchase did not go through'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const restore = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (await app.restorePurchases()) finish();
      else Alert.alert(t('No purchases found'), t('There’s nothing to restore on this account.'));
    } catch (e) {
      Alert.alert(t('Could not restore purchases'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // The five reasons shown on the page; the rest of Plus is on the Plus screen.
  const benefits = [
    t('A fresh plan every week'),
    t('Swap any meal and watch the budget update'),
    t('Cook mode with step timers, and edit any recipe'),
    t('Savings report and full nutrition on every recipe'),
    t('Send your list to anyone, or to Reminders'),
  ];

  // The big price counts up from zero when the sheet opens, then settles on the store's own string. It pops when the plan changes.
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setArmed(true), 450);
    return () => clearTimeout(id);
  }, []);
  const target = packages[plan]?.product.price ?? chosen.price;
  const counted = useCountUp(armed ? target : 0, 900);
  const heroPrice = Math.abs(counted - target) > 0.004 ? `$${counted.toFixed(2)}` : priceOf(chosen);
  const pop = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    pop.setValue(0.88);
    Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 7, stiffness: 180 }).start();
  }, [plan, pop]);

  // Yearly leads; the toggle above the price switches to monthly and back.
  const pickPlan = (id: (typeof PLANS)[number]['id']) => {
    if (id === plan) return;
    haptic.select();
    animateLayout();
    setPlan(id);
    if (startPlan) track('paywall_default_plan', startPlan, `plan_picked_${id}`);
  };

  // Apple's required renewal terms, one whole paragraph per store so each names its own account and settings the way
  // that store does.
  const terms = { price: priceOf(chosen), period: tx(chosen.per) };
  const renewal = trial
    ? Platform.OS === 'ios'
      ? t('Your free trial of {trial} starts today. After it ends, Kelmi Plus renews automatically at {price} per {period} until you cancel. Payment is charged to your Apple ID unless you turn off auto-renew at least 24 hours before the trial ends. Manage or cancel any time in your App Store account settings.', { ...terms, trial: trialText })
      : t('Your free trial of {trial} starts today. After it ends, Kelmi Plus renews automatically at {price} per {period} until you cancel. Payment is charged to your Google Play account unless you cancel at least 24 hours before the trial ends. Manage or cancel any time in Google Play, under Payments and subscriptions.', { ...terms, trial: trialText })
    : Platform.OS === 'ios'
      ? t('Kelmi Plus renews automatically at {price} per {period} until you cancel. Payment is charged to your Apple ID when you confirm. Turn off auto-renew at least 24 hours before the period ends to avoid the next charge. Manage or cancel any time in your App Store account settings.', terms)
      : t('Kelmi Plus renews automatically at {price} per {period} until you cancel. Payment is charged to your Google Play account when you confirm. Turn off auto-renew at least 24 hours before the period ends to avoid the next charge. Manage or cancel any time in Google Play, under Payments and subscriptions.', terms);

  // One icon per benefit, in the same order as the list above.
  const benefitIcons = ['calendar-outline', 'swap-horizontal', 'timer-outline', 'wallet-outline', 'share-outline'] as const;

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View pointerEvents="none" style={[styles.blobBig, { backgroundColor: c.tint }]} />
      <View pointerEvents="none" style={[styles.blobSmall, { backgroundColor: c.badge }]} />

      <View style={styles.top}>
        <TextButton label={t('Restore')} bold={false} color={c.muted} onPress={restore} />
        <IconButton icon="close" label={t('Close, stay on the free plan')} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.pipBox}>
            <Sparkle delay={900} size={16} color={c.primary} style={{ left: -4, top: 4 }} />
            <Sparkle delay={1200} size={14} color="#A7D96B" style={{ right: -4, bottom: 6 }} />
            <Halo color={c.tint} />
            <PipEntrance>
              <Mascot pose={pitch?.pose ?? 'cheer'} size={78} tappable label={t('Pip, Kelmi\'s jar, cheering')} />
            </PipEntrance>
          </View>
          <Reveal index={1} style={styles.flex}>
            {pitch ? (
              <View style={styles.lockedTag}>
                <Ionicons name="lock-closed" size={12} color={c.primaryText} />
                <AppText variant="eyebrow" color={c.primaryText}>{t('Part of Kelmi Plus')}</AppText>
              </View>
            ) : null}
            <AppText variant="title" accessibilityRole="header">
              {pitch ? pitch.title : t('Plan every week around your budget')}
            </AppText>
            {pitch ? <AppText variant="subhead" color={c.muted}>{pitch.body}</AppText> : null}
          </Reveal>
        </View>

        <Reveal index={1}>
          <PlanToggle
            value={plan}
            onChange={pickPlan}
            items={PLANS.map((p) => ({ id: p.id, label: tx(p.name) }))}
            label={t('Choose a plan')}
          />
        </Reveal>

        <Reveal index={2}>
          <View style={[styles.priceCard, { backgroundColor: c.card, borderColor: c.line }]}>
            {trial ? (
              <View pointerEvents="none" style={styles.ribbonWrap}>
                <PopIn delay={800}>
                  <View style={[styles.ribbon, { backgroundColor: c.primary }]}>
                    <AppText variant="footnote" weight="700" color={c.onPrimary}>{t('{trial} free', { trial: trialText })}</AppText>
                  </View>
                </PopIn>
              </View>
            ) : null}
            {chosen.badge ? (
              <View pointerEvents="none" style={styles.sticker}>
                <PopIn delay={1000}>
                  <Breathe amount={1.06}>
                    <View style={[styles.chip, { backgroundColor: c.badge }]}>
                      <AppText variant="footnote" weight="700" color={c.badgeText}>{tx(chosen.badge)}</AppText>
                    </View>
                  </Breathe>
                </PopIn>
              </View>
            ) : null}
            <Animated.View style={[styles.priceRow, { transform: [{ scale: pop }] }]}>
              <AppText
                style={[styles.bigPrice, { fontFamily: fonts.display }]}
                accessibilityLabel={`${priceOf(chosen)} ${t('per {period}', { period: tx(chosen.per) })}`}
              >
                {heroPrice}
              </AppText>
              <AppText color={c.muted} style={styles.per}>{t('per {period}', { period: tx(chosen.per) })}</AppText>
            </Animated.View>
            <AppText color={c.muted} style={styles.center}>{tx(chosen.billed)}</AppText>
          </View>
        </Reveal>

        <View style={[styles.benefitCard, { backgroundColor: c.card, borderColor: c.line }]}>
          {benefits.map((b, i) => (
            <Reveal key={b} index={3 + i} lift={10}>
              <View style={[styles.benefit, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pitch?.benefit === i && { backgroundColor: c.tint, borderRadius: 10, marginHorizontal: -6, paddingHorizontal: 6 }]}>
                <PopIn delay={700 + i * 140}>
                  <View style={[styles.iconTile, { backgroundColor: c.tint }]}>
                    <Ionicons name={benefitIcons[i] ?? 'checkmark'} size={18} color={c.primaryText} />
                  </View>
                </PopIn>
                <AppText style={styles.flex}>{b}</AppText>
              </View>
            </Reveal>
          ))}
        </View>
      </ScrollView>

      <View style={[styles.footer, { borderTopColor: c.line }]}>
        <Breathe amount={1.025}>
          <Shine>
            <PrimaryButton label={trial ? t('Start free trial') : t('Continue')} feedback="success" loading={busy} onPress={subscribe} />
          </Shine>
        </Breathe>
        {trial ? (
          <AppText variant="footnote" weight="600" style={styles.center}>
            {t('{trial} free, then {price} per {period}', { ...terms, trial: trialText })}
          </AppText>
        ) : null}
        <AppText variant="footnote" color={c.muted} style={[styles.center, styles.fine]}>
          {renewal}
        </AppText>
        <View style={styles.links}>
          <TextButton label={t('Terms')} bold={false} color={c.muted} onPress={() => router.push('/legal/terms')} />
          <TextButton label={t('Privacy')} bold={false} color={c.muted} onPress={() => router.push('/legal/privacy')} />
        </View>
      </View>
    </SafeAreaView>
  );
}


// Pip drops in from above with a tilt and settles with a bounce, once the sheet is up.
function PipEntrance({ children }: { children: ReactNode }) {
  const v = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.spring(v, { toValue: 1, useNativeDriver: true, damping: 8, stiffness: 120, mass: 0.9 }).start();
  }, [v]);
  return (
    <Animated.View
      style={{
        opacity: v.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0, 1, 1] }),
        transform: [
          { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) },
          { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) },
          { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        ],
      }}
    >
      {children}
    </Animated.View>
  );
}

// Springs its content up from nothing after a delay.
function PopIn({ delay = 0, children }: { delay?: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(v, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 200, mass: 0.8 }),
    ]).start();
  }, [v, delay]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

// A slow breath, so the saving chip and the button quietly draw the eye.
function Breathe({ amount = 1.03, children }: { amount?: number; children: ReactNode }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: amount, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, amount]);
  return <Animated.View style={{ transform: [{ scale: v }] }}>{children}</Animated.View>;
}

// A small sparkle that pops in around Pip, then drifts and twists.
function Sparkle({ delay, size, color, style }: { delay: number; size: number; color: string; style: ViewStyle }) {
  const pop = useRef(new Animated.Value(reduceMotion() ? 1 : 0)).current;
  const drift = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    Animated.sequence([Animated.delay(delay), Animated.spring(pop, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 180 })]).start();
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(drift, { toValue: 1, duration: 1400 + (delay % 400), easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(drift, { toValue: 0, duration: 1400 + (delay % 400), easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pop, drift, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.sparkle,
        style,
        {
          transform: [
            { scale: pop },
            { translateY: drift.interpolate({ inputRange: [0, 1], outputRange: [0, -6] }) },
            { rotate: drift.interpolate({ inputRange: [0, 1], outputRange: ['-12deg', '12deg'] }) },
          ],
        },
      ]}
    >
      <Ionicons name="sparkles" size={size} color={color} />
    </Animated.View>
  );
}


// A two-way switch: a pill that slides under the chosen label. Reads as one radio group to a screen reader.
function PlanToggle({
  value,
  onChange,
  items,
  label,
}: {
  value: string;
  onChange: (id: (typeof PLANS)[number]['id']) => void;
  items: { id: (typeof PLANS)[number]['id']; label: string }[];
  label: string;
}) {
  const c = useTheme();
  const [w, setW] = useState(0);
  const index = Math.max(0, items.findIndex((i) => i.id === value));
  const slide = useRef(new Animated.Value(index)).current;
  useEffect(() => {
    if (reduceMotion()) {
      slide.setValue(index);
      return;
    }
    Animated.spring(slide, { toValue: index, useNativeDriver: true, damping: 14, stiffness: 190, mass: 0.8 }).start();
  }, [index, slide]);
  const seg = Math.max(0, (w - 8) / items.length);
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.toggle, { backgroundColor: c.tint, borderColor: c.line }]}
    >
      {seg ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.toggleThumb, { width: seg, backgroundColor: c.primary, transform: [{ translateX: slide.interpolate({ inputRange: [0, items.length - 1 || 1], outputRange: [0, seg * (items.length - 1)] }) }] }]}
        />
      ) : null}
      {items.map((item) => {
        const on = item.id === value;
        return (
          <Pressable
            key={item.id}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            onPress={() => onChange(item.id)}
            style={styles.toggleItem}
          >
            <AppText weight="600" color={on ? c.onPrimary : c.muted}>{item.label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// A soft ring that swells and fades behind Pip, over and over, like a heartbeat.
function Halo({ color }: { color: string }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion()) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return (
    <>
      <View pointerEvents="none" style={[styles.halo, { backgroundColor: color }]} />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.halo,
          { backgroundColor: color, opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }), transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }] },
        ]}
      />
    </>
  );
}

// A band of light that sweeps across the button every few seconds.
function Shine({ children }: { children: ReactNode }) {
  const [w, setW] = useState(0);
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion() || !w) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2200),
        Animated.timing(v, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v, w]);
  return (
    <View style={styles.shineWrap} onLayout={(e) => setW(e.nativeEvent.layout.width)}>
      {children}
      {w ? (
        <Animated.View
          pointerEvents="none"
          style={[styles.shineBand, { transform: [{ translateX: v.interpolate({ inputRange: [0, 1], outputRange: [-80, w + 40] }) }, { rotate: '18deg' }] }]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  blobBig: { position: 'absolute', top: -90, right: -90, width: 300, height: 300, borderRadius: 150, opacity: 0.85 },
  blobSmall: { position: 'absolute', top: 150, left: -70, width: 170, height: 170, borderRadius: 85, opacity: 0.22 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8 },
  content: { paddingHorizontal: space.gutter, paddingTop: 0, paddingBottom: 12, gap: 14 },
  center: { textAlign: 'center', alignItems: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  pipBox: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  halo: { position: 'absolute', width: 84, height: 84, borderRadius: 42 },
  sparkle: { position: 'absolute' },
  toggle: { flexDirection: 'row', alignSelf: 'center', width: '78%', marginBottom: 12, padding: 4, borderRadius: radius.pill, borderWidth: StyleSheet.hairlineWidth },
  toggleThumb: { position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: radius.pill },
  toggleItem: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center' },
  priceCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card + 6, paddingTop: 22, paddingBottom: 16, paddingHorizontal: 16, alignItems: 'center', gap: 2 },
  ribbonWrap: { position: 'absolute', top: -14, left: 10, transform: [{ rotate: '-6deg' }] },
  ribbon: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  sticker: { position: 'absolute', top: -14, right: 10, transform: [{ rotate: '7deg' }] },
  chip: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.pill },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 6 },
  bigPrice: { fontSize: 50, lineHeight: 56, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  per: { fontSize: 15 },
  benefitCard: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, paddingHorizontal: 12 },
  benefit: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 },
  iconTile: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  links: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16 },
  fine: { fontSize: 11, lineHeight: 14 },
  lockedTag: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 10, gap: 4, borderTopWidth: StyleSheet.hairlineWidth, alignItems: 'stretch' },
  shineWrap: { borderRadius: radius.pill, overflow: 'hidden' },
  shineBand: { position: 'absolute', top: -20, bottom: -20, width: 46, backgroundColor: 'rgba(255,255,255,0.28)' },
});
