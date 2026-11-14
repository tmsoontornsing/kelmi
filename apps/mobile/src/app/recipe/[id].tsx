import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { EstimateNote } from '../../components/EstimateNote';
import { usePlusLabel } from '../../components/PlusLock';
import { Card, IconButton, TextButton } from '../../components/Buttons';
import { Mascot } from '../../components/Mascot';
import { MealPhoto } from '../../components/MealPhoto';
import { RateMeal } from '../../components/RateMeal';
import { NutritionFacts } from '../../components/NutritionFacts';
import { Bone, RecipeSkeleton } from '../../components/Skeleton';
import { applianceName, MEAL_LABELS, money, type RecipeView } from '../../data/mock';
import { comma, useT } from '../../i18n';
import * as api from '../../lib/api';
import { onDeviceUnlocked, PLUS_ENABLED } from '../../lib/flags';
import { openPlus } from '../../lib/plusFeatures';
import { animateLayout, haptic, PressableScale, reduceMotion, Reveal } from '../../motion';
import { backOr, share as shareText } from '../../navigation';
import { useApp } from '../../state/AppState';
import { fonts, radius, space, useTheme } from '../../theme';

// Title-case a dish name for the large heading. English only; other languages keep the translation's own casing.
const titleCase = (s: string) => s.replace(/(^|[\s-])(\w)/g, (m) => m.toUpperCase()).replace(/ (And|With) /g, (m) => m.toLowerCase());

export default function Recipe() {
  const c = useTheme();
  const app = useApp();
  const { t, tx, line, minutes, midSentence, lang } = useT();
  const plusLabel = usePlusLabel();
  const { id, slot } = useLocalSearchParams<{ id: string; slot?: string }>();
  const slotIndex = slot !== undefined && Number.isInteger(Number(slot)) ? Number(slot) : undefined;
  // Opened from a slot in the plan, follow that slot so a swap updates this screen too.
  const planned = slotIndex !== undefined ? app.plan[slotIndex] : undefined;
  const recipeId = planned?.id ?? id;

  // undefined while loading, null when the recipe can't be found.
  const [view, setView] = useState<RecipeView | null | undefined>(undefined);
  // Steps ticked off while cooking; a swapped-in recipe starts clean.
  const [doneSteps, setDoneSteps] = useState<Record<number, boolean>>({});
  useEffect(() => setDoneSteps({}), [recipeId]);
  // The recipe is split into tabs so it fits on a screen or two instead of one long scroll.
  const [tab, setTab] = useState<'ingredients' | 'steps' | 'nutrition'>('ingredients');
  useEffect(() => setTab('ingredients'), [recipeId]);
  // Moving between tabs slides the new one in from the side it sits on, and the highlight glides to it.
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const pos = useRef(new Animated.Value(0)).current;
  const [segWidth, setSegWidth] = useState(0);
  const order = ['ingredients', 'steps', 'nutrition'] as const;
  const changeTab = (next: (typeof order)[number]) => {
    if (next === tab) return;
    haptic.select();
    const to = order.indexOf(next);
    const dir = to > order.indexOf(tab) ? 1 : -1;
    setTab(next);
    if (reduceMotion()) {
      pos.setValue(to);
      return;
    }
    slide.setValue(dir * 48);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(fade, { toValue: 1, duration: 220, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(pos, { toValue: to, damping: 18, stiffness: 220, mass: 0.8, useNativeDriver: true }),
    ]).start();
  };
  useEffect(() => {
    let cancelled = false;
    setView(undefined);
    app
      .getRecipe(recipeId, slotIndex)
      .then((v) => !cancelled && setView(v))
      .catch(() => !cancelled && setView(null));
    return () => {
      cancelled = true;
    };
    // Reload when the meal in this slot changes, or the household size rescales the quantities.
  }, [recipeId, slotIndex, app.people]);

  // The recipe's photo and, when its licence asks for one, the credit. Read apart from the recipe so a database that has no
  // photo columns yet still shows the recipe.
  const [photo, setPhoto] = useState<{ url: string; credit: string | null } | null>(null);
  useEffect(() => {
    let cancelled = false;
    setPhoto(null);
    if (app.live) api.loadRecipePhoto(recipeId).then((p) => !cancelled && setPhoto(p)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [recipeId, app.live]);

  const meal = planned ?? view?.meal;
  const detail = view?.detail ?? undefined;
  const missing = detail ? detail.appliances.filter((a) => !app.appliances.includes(a)) : [];

  if (!meal) {
    return (
      <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
        {view === undefined ? (
          <RecipeSkeleton />
        ) : (
          <AppText style={styles.missing}>{t('This recipe isn’t available.')}</AppText>
        )}
      </SafeAreaView>
    );
  }

  const allDone = !!detail && detail.steps.length > 0 && detail.steps.every((_, i) => doneSteps[i]);

  const total = detail
    ? detail.ingredients.reduce((s, i) => s + (i.price === 'pantry' ? 0 : i.price), 0)
    : meal.cost;
  const missingNames = missing.map((m) => tx(applianceName(m)).toLowerCase());
  const tabs = [
    { id: 'ingredients' as const, label: detail ? t('Ingredients · {n}', { n: detail.ingredients.length }) : t('Ingredients') },
    { id: 'steps' as const, label: detail ? t('Steps · {n}', { n: detail.steps.length }) : t('Steps') },
    ...(detail?.nutrition ? [{ id: 'nutrition' as const, label: t('Nutrition') }] : []),
  ];

  // A plain-text copy of the recipe for Messages, Notes or anywhere else. Free for everyone, and nothing personal goes in it.
  const shareRecipe = () => {
    const name = lang === 'en' ? titleCase(meal.name) : tx(meal.name);
    const ingredients = detail ? detail.ingredients.map((i) => `• ${line(i.name)}`).join('\n') : '';
    const steps = detail ? detail.steps.map((st, i) => `${i + 1}. ${tx(st)}`).join('\n') : '';
    shareText([name, minutes(meal.minutes), ingredients && `${t('Ingredients')}\n${ingredients}`, steps && `${t('Steps')}\n${steps}`, t('Planned with Kelmi · usekelmi.com')].filter(Boolean).join('\n\n'), name);
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={['top']}>
      <View style={styles.bar}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Back to This Week')}
          onPress={() => backOr('/week')}
          style={({ pressed }) => [styles.back, { opacity: pressed ? 0.6 : 1 }]}
        >
          <Ionicons name="chevron-back" size={24} color={c.primaryText} />
          <AppText color={c.primaryText}>{t('This Week')}</AppText>
        </Pressable>
        <View style={styles.barActions}>
          {app.live && PLUS_ENABLED ? (
            <IconButton
              icon={app.subscribed ? 'create-outline' : 'lock-closed-outline'}
              label={plusLabel(t('Edit this recipe'), app.subscribed)}
              onPress={() => (app.subscribed ? router.push({ pathname: '/recipe-edit/[id]', params: { id: recipeId } }) : openPlus('edit'))}
            />
          ) : null}
          <IconButton icon="share-outline" label={t('Share this recipe')} onPress={shareRecipe} />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.titleBlock}>
          <AppText variant="eyebrow">
            {planned
              ? t('{day} {meal}', { day: tx(planned.dayLong), meal: tx(MEAL_LABELS[planned.type]).toLowerCase() })
              : tx(MEAL_LABELS[meal.type])}
          </AppText>
          <AppText style={styles.title} accessibilityRole="header">
            {lang === 'en' ? titleCase(meal.name) : tx(meal.name)}
          </AppText>
          <View style={styles.pills}>
            {[
              minutes(meal.minutes),
              t('Serves {n}', { n: detail?.serves ?? app.people }),
              t('{amount} est.', { amount: money(total) }),
            ].map((p) => (
              <View key={p} style={[styles.pill, { backgroundColor: c.card }]}>
                <AppText variant="subhead" color={c.text} style={{ fontVariant: ['tabular-nums'] }}>{p}</AppText>
              </View>
            ))}
          </View>
          {detail?.edited ? (
            <View style={[styles.editedChip, { backgroundColor: c.tint }]}>
              <Ionicons name="create-outline" size={14} color={c.primaryText} />
              <AppText variant="footnote" weight="600" color={c.primaryText}>{t('Your version')}</AppText>
            </View>
          ) : null}
          {detail?.note ? (
            <AppText variant="subhead" style={[styles.noteText, { borderLeftColor: c.primary }]}>{detail.note}</AppText>
          ) : null}
        </View>

        {photo ? (
          <View style={styles.photoBlock}>
            <MealPhoto uri={photo.url} height={200} radius={radius.row} />
            {photo.credit ? (
              <AppText variant="footnote" style={styles.photoCredit}>
                {t('Photo: {credit}', { credit: photo.credit })}
              </AppText>
            ) : null}
          </View>
        ) : null}

        {detail ? (
          <>
            <View style={styles.actions}>
            {detail.steps.length > 0 ? (
              <PressableScale
                accessibilityRole="button"
                accessibilityLabel={plusLabel(t('Start Cook mode'), app.subscribed)}
                to={0.97}
                onPress={() => {
                  haptic.tap();
                  if (!onDeviceUnlocked(app.subscribed)) return openPlus('cook');
                  router.push({ pathname: '/cook/[id]', params: { id: recipeId, ...(slotIndex !== undefined ? { slot: String(slotIndex) } : {}) } });
                }}
                style={[styles.cookBtn, styles.flex, { backgroundColor: c.primary }]}
              >
                <Ionicons name={onDeviceUnlocked(app.subscribed) ? 'restaurant' : 'lock-closed-outline'} size={20} color={c.onPrimary} />
                <AppText weight="600" color={c.onPrimary} style={styles.cookLabel}>{t('Start Cook mode')}</AppText>
              </PressableScale>
            ) : null}
              {planned ? (
                <PressableScale
                  accessibilityRole="button"
                  accessibilityLabel={plusLabel(t('Swap {meal}', { meal: midSentence(tx(MEAL_LABELS[planned.type])) }), app.subscribed)}
                  to={0.95}
                  onPress={() => {
                    haptic.tap();
                    if (!onDeviceUnlocked(app.subscribed)) return openPlus('swap');
                    router.push({ pathname: '/swap/[slot]', params: { slot: String(slotIndex) } });
                  }}
                  style={[styles.swapBtn, { backgroundColor: c.tint }]}
                >
                  <Ionicons name={onDeviceUnlocked(app.subscribed) ? 'swap-horizontal' : 'lock-closed-outline'} size={20} color={c.primaryText} />
                  <AppText weight="600" color={c.primaryText}>{t('Swap')}</AppText>
                </PressableScale>
              ) : null}
            </View>

            {missing.length > 0 ? (
              <View style={[styles.missingBar, { backgroundColor: c.warnBg }]}>
                <Ionicons name="alert-circle" size={18} color={c.warn} />
                <AppText variant="footnote" color={c.warn} style={styles.flex}>
                  {missingNames.length === 1
                    ? t('Your kitchen doesn’t list a {item}.', { item: missingNames[0] })
                    : t('Your kitchen doesn’t list a {items} or a {last}.', {
                        items: missingNames.slice(0, -1).join(comma()),
                        last: missingNames[missingNames.length - 1],
                      })}
                </AppText>
                <TextButton label={t('Update Kitchen')} onPress={() => router.push('/onboarding/kitchen?edit=1')} />
              </View>
            ) : null}

            <View accessibilityRole="tablist" style={[styles.tabs, { backgroundColor: c.tint }]} onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}>
              {segWidth > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.tabPill,
                    {
                      backgroundColor: c.card,
                      width: (segWidth - 8) / tabs.length - 2,
                      transform: [{ translateX: Animated.multiply(pos, (segWidth - 8) / tabs.length) }],
                    },
                  ]}
                />
              ) : null}
              {tabs.map((tb) => {
                const on = tab === tb.id;
                return (
                  <Pressable
                    key={tb.id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    onPress={() => changeTab(tb.id)}
                    style={styles.tab}
                  >
                    <AppText variant="subhead" weight="600" color={on ? c.text : c.muted} numberOfLines={1}>{tb.label}</AppText>
                  </Pressable>
                );
              })}
            </View>

            <Animated.View style={[styles.slideBox, { opacity: fade, transform: [{ translateX: slide }] }]}>
            {tab === 'ingredients' ? (
              <View style={styles.section}>
              <Card style={styles.list}>
                {detail.ingredients.map((ing, i) => (
                  <View
                    key={ing.name}
                    style={[styles.ingredient, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                  >
                    <AppText style={styles.flex}>{line(ing.name)}</AppText>
                    {ing.price === 'pantry' ? (
                      <View style={[styles.tag, { backgroundColor: c.tint }]}>
                        <AppText variant="footnote" weight="600" color={c.primaryText}>{t('Pantry')}</AppText>
                      </View>
                    ) : (
                      <AppText variant="subhead" style={{ fontVariant: ['tabular-nums'] }}>{money(ing.price)}</AppText>
                    )}
                  </View>
                ))}
              </Card>
              <AppText variant="footnote">{t('Pantry items cost $0 here because they’re already on your shelf.')}</AppText>
              {app.allergies.length > 0 ? (
                <AppText variant="footnote" color={c.warn}>
                  {t('Check every label for {allergies}. Products vary by brand, and Kelmi can’t guarantee a recipe is allergen-free.', {
                    allergies: app.allergies.map(tx).join(comma()).toLowerCase(),
                  })}
                </AppText>
              ) : null}
              </View>
            ) : null}

            {tab === 'steps' ? (
              <View style={styles.section}>
                {detail.appliances.length > 0 ? (
                  <View style={styles.pills}>
                    {detail.appliances.map((id) => {
                      const have = !missing.includes(id);
                      const name = tx(applianceName(id));
                      return (
                        <View
                          key={id}
                          accessible
                          accessibilityLabel={have ? t('{item}, in your kitchen', { item: name }) : t('{item}, not in your kitchen', { item: name })}
                          style={[styles.equip, { backgroundColor: have ? c.card : c.warnBg }]}
                        >
                          <Ionicons name={have ? 'checkmark-circle' : 'alert-circle'} size={16} color={have ? c.primaryText : c.warn} />
                          <AppText variant="subhead" weight="500" color={have ? c.text : c.warn}>{name}</AppText>
                        </View>
                      );
                    })}
                  </View>
                ) : null}
              {detail.steps.map((step, i) => {
                const done = !!doneSteps[i];
                return (
                  <PressableScale
                    key={step}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: done }}
                    accessibilityHint={t('Marks this step as done')}
                    to={0.98}
                    onPress={() => {
                      haptic.tap();
                      animateLayout();
                      setDoneSteps((d) => ({ ...d, [i]: !d[i] }));
                    }}
                    style={styles.step}
                  >
                    <View style={[styles.stepNum, { backgroundColor: done ? c.primary : c.tint }]}>
                      {done ? (
                        <Ionicons name="checkmark" size={16} color={c.onPrimary} />
                      ) : (
                        <AppText variant="subhead" weight="700" color={c.primaryText}>{i + 1}</AppText>
                      )}
                    </View>
                    <AppText style={[styles.flex, done && styles.stepDone]} color={done ? c.muted : c.text}>{tx(step)}</AppText>
                  </PressableScale>
                );
              })}
              {allDone ? (
                <Reveal lift={12}>
                  <Card style={styles.finished}>
                    <Mascot pose="yum" size={96} decorative tappable />
                    <View style={styles.flex}>
                      <AppText variant="headline">{t('Dinner is ready')}</AppText>
                      <AppText variant="subhead">{t('Every step is done. Enjoy it.')}</AppText>
                    </View>
                  </Card>
                </Reveal>
              ) : null}
              </View>
            ) : null}

            {tab === 'nutrition' && detail.nutrition ? (
              <View style={styles.section}>
                <NutritionFacts nutrition={detail.nutrition} serves={detail.serves} locked={!onDeviceUnlocked(app.subscribed)} />
                <EstimateNote />
              </View>
            ) : null}

            {tab !== 'nutrition' ? <EstimateNote /> : null}

            {tab === 'steps' ? (
              <>
                {planned ? <TextButton label={t('Cooked this? Save leftovers')} onPress={() => router.push('/pantry')} /> : null}
                <RateMeal recipeId={recipeId} name={lang === 'en' ? titleCase(meal.name) : tx(meal.name)} />
              </>
            ) : null}
            </Animated.View>
          </>
        ) : view === undefined ? (
          <Bone width="100%" height={140} round={radius.card} />
        ) : (
          <Card style={styles.pending}>
            <AppText color={c.muted}>{t('Ingredients and steps for this meal aren’t available yet.')}</AppText>
          </Card>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  photoBlock: { gap: 6 },
  photoCredit: { paddingHorizontal: 2 },
  cookBtn: { minHeight: 50, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  cookLabel: { fontFamily: fonts.displaySemi, fontSize: 17 },
  root: { flex: 1 },
  flex: { flex: 1 },
  missing: { padding: 24 },
  bar: { paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  back: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 2, paddingRight: 8 },
  actions: { flexDirection: 'row', gap: 10 },
  barActions: { flexDirection: 'row', gap: 8 },
  editedChip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  noteText: { borderLeftWidth: 3, paddingLeft: 10 },
  swapBtn: { minHeight: 50, paddingHorizontal: 16, borderRadius: radius.control, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  slideBox: { gap: 14 },
  tabPill: { position: 'absolute', left: 5, top: 4, bottom: 4, borderRadius: radius.control - 3 },
  content: { paddingHorizontal: space.gutter, paddingTop: 4, paddingBottom: 40, gap: 14 },
  titleBlock: { gap: 8 },
  title: { fontFamily: fonts.display, fontSize: 32, lineHeight: 36, letterSpacing: -0.6 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  equip: { paddingLeft: 10, paddingRight: 12, paddingVertical: 7, borderRadius: radius.pill, flexDirection: 'row', alignItems: 'center', gap: 6 },
  missingRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  missingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingLeft: 12, paddingRight: 4, paddingVertical: 4, borderRadius: radius.control },
  tabs: { flexDirection: 'row', padding: 4, borderRadius: radius.control, gap: 4 },
  tab: { flex: 1, minHeight: 40, borderRadius: radius.control - 3, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  section: { gap: 8 },
  list: { paddingHorizontal: 16, paddingVertical: 4 },
  ingredient: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12 },
  tag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  step: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  stepDone: { textDecorationLine: 'line-through' },
  pending: { padding: 16 },
  stepsHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  reader: { marginBottom: -6 },
  finished: { padding: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
});
