import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, type ComponentProps } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Card, IconButton, TextButton } from '../../components/Buttons';
import { LeftoversSection } from '../../components/Leftovers';
import { LottieOnce } from '../../components/Lottie';
import { Mascot } from '../../components/Mascot';
import { FREE_PANTRY_LIMIT, PlusNotice } from '../../components/PlusLock';
import { PLUS_ENABLED } from '../../lib/flags';
import { ShelfBadge, ShelfCard } from '../../components/ShelfParts';
import { TabScreen } from '../../components/TabScreen';
import { money } from '../../data/mock';
import { COMMON, findFood, guessShelf, shelfOfFood, suggestFoods } from '../../data/pantryCommon';
import { comma, useT } from '../../i18n';
import { allergensIn } from '../../lib/allergens';
import { animateLayout, haptic, PressableScale, Reveal, Wiggle } from '../../motion';
import { useApp } from '../../state/AppState';
import { fonts, radius, useTheme } from '../../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

// The shelves a new item can go on, in the order they appear. Names stay English here (they are saved); shown with tx().
// i18n: content
const SHELVES: { name: string; icon: IconName }[] = [
  { name: 'Staples', icon: 'basket-outline' },
  { name: 'Spices', icon: 'leaf-outline' },
  { name: 'Fridge', icon: 'snow-outline' },
  { name: 'Freezer', icon: 'cube-outline' },
  { name: 'Produce', icon: 'nutrition-outline' },
];
const ORDER_KEY = 'kavi.shelfOrder';
const shelfIcon = (name: string): IconName => SHELVES.find((s) => s.name === name)?.icon ?? 'file-tray-outline';

export default function Pantry() {
  const c = useTheme();
  const { t, tn, tx } = useT();
  // Allergy labels as a phrase inside a sentence: "milk and eggs".
  const allergenNames = (hits: string[]) => hits.map((h) => tx(h).toLowerCase());
  const andList = (hits: string[]) => allergenNames(hits).reduce((a, b) => t('{a} and {b}', { a, b }));
  const { pantry, pantrySavings, allergies, addPantryItem, removePantryItem, subscribed } = useApp();
  // Counts up each time the savings figure rises, so the coins play for a new saving and not when the screen opens.
  const lastSavings = useRef(pantrySavings);
  const [savingsGrew, setSavingsGrew] = useState(0);
  useEffect(() => {
    if (pantrySavings > lastSavings.current) setSavingsGrew((n) => n + 1);
    lastSavings.current = pantrySavings;
  }, [pantrySavings]);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  // What was typed when it didn't match a food, so the message can name it. Cleared as soon as the text changes.
  const [unknown, setUnknown] = useState<string | null>(null);
  const [shelf, setShelf] = useState('Staples');
  // Once someone taps a shelf themselves, typing stops moving the choice.
  const picked = useRef(false);
  // The order the person put the shelves in, saved on the phone. A shelf not in it keeps its default place after the rest.
  const [order, setOrder] = useState<string[]>([]);
  // Counts up each time a shelf is moved, so its card lights up in its new spot.
  const [moved, setMoved] = useState<{ name: string; n: number } | null>(null);
  useEffect(() => {
    AsyncStorage.getItem(ORDER_KEY)
      .then((v) => {
        const saved = v ? JSON.parse(v) : null;
        if (Array.isArray(saved)) setOrder(saved.filter((x): x is string => typeof x === 'string'));
      })
      .catch(() => {});
  }, []);
  const count = pantry.reduce((n, s) => n + s.items.length, 0);
  // The free plan holds a set number of pantry items once Plus exists to lift it; until then there is no limit.
  const full = PLUS_ENABLED && !subscribed && count >= FREE_PANTRY_LIMIT;
  const common = COMMON[shelf] ?? [];
  // The common list starts short and opens up, so a shelf with thirty foods doesn't push everything else off the screen.
  const [showAll, setShowAll] = useState(false);
  const COMMON_PREVIEW = 9;
  const visibleCommon = showAll ? common : common.slice(0, COMMON_PREVIEW);
  // Which shelf an item already sits on, so tapping a ticked chip takes it off the right one.
  const shelfOf = (item: string) => pantry.find((s) => s.items.some((i) => i.toLowerCase() === item.toLowerCase()))?.name;
  // Items whose names point to one of the household's allergies, for the warning card and the flagged chips.
  const flagged = pantry.flatMap((s) =>
    s.items.flatMap((item) => {
      const hits = allergensIn(item, allergies);
      return hits.length ? [{ item, shelf: s.name, hits }] : [];
    }),
  );
  const draftHits = allergensIn(draft, allergies);
  const suggestions = suggestFoods(draft, tx);

  const rank = (name: string) => {
    const i = order.indexOf(name);
    return i < 0 ? 1000 + pantry.findIndex((s) => s.name === name) : i;
  };
  const shown = pantry.filter((s) => s.items.length > 0).sort((a, b) => rank(a.name) - rank(b.name));

  // Swaps a shelf with its neighbor. The card slides there and glows so the eye can follow it.
  const moveShelf = (name: string, by: -1 | 1) => {
    const names = shown.map((s) => s.name);
    const from = names.indexOf(name);
    const to = from + by;
    if (from < 0 || to < 0 || to >= names.length) return;
    [names[from], names[to]] = [names[to], names[from]];
    animateLayout();
    haptic.select();
    setOrder(names);
    setMoved((m) => ({ name, n: (m?.n ?? 0) + 1 }));
    AsyncStorage.setItem(ORDER_KEY, JSON.stringify(names)).catch(() => {});
    AccessibilityInfo.announceForAccessibility(t('{shelf} moved to position {n} of {total}', { shelf: tx(name), n: to + 1, total: names.length }));
  };

  // Only foods Kelmi knows go on a shelf: the name is looked up, and what is saved is the catalog's own name. Stays open after
  // each add, so several things can go in one go.
  const addFood = (food: string) => {
    if (full) return haptic.error();
    setDraft('');
    setUnknown(null);
    if (shelfOf(food)) return haptic.tap();
    animateLayout();
    haptic.success();
    addPantryItem(picked.current ? shelf : (shelfOfFood(food) ?? shelf), food);
  };

  const submit = () => {
    const typed = draft.trim();
    if (!typed) return;
    const food = findFood(typed, tx);
    if (food) return addFood(food);
    haptic.error();
    setUnknown(typed);
  };

  // A common item toggles: tap to add it to the shelf showing, tap again to take it off.
  const toggleCommon = (name: string) => {
    animateLayout();
    const on = shelfOf(name);
    if (on) {
      haptic.tap();
      removePantryItem(on, name);
    } else if (full) {
      haptic.error();
    } else {
      haptic.success();
      addPantryItem(shelf, name);
    }
  };

  const typeDraft = (text: string) => {
    setDraft(text);
    setUnknown(null);
    const guess = picked.current ? null : guessShelf(text);
    if (guess) setShelf(guess);
  };

  const closeAdd = () => {
    animateLayout();
    setDraft('');
    picked.current = false;
    setAdding(false);
  };

  const header = (
    <View style={styles.headRow}>
      <View style={styles.flex}>
        <AppText variant="largeTitle" accessibilityRole="header">{t('Pantry')}</AppText>
        <AppText variant="subhead">{t('What you already have')}</AppText>
      </View>
      {count > 0 ? <TextButton label={editing ? t('Done') : t('Edit')} onPress={() => setEditing((e) => !e)} /> : null}
      <IconButton icon={adding ? 'close' : 'add'} label={adding ? t('Close add item') : t('Add an item')} onPress={() => (adding ? closeAdd() : setAdding(true))} />
    </View>
  );

  return (
    <TabScreen tab="pantry" header={header}>
      {adding ? (
        <Reveal>
          <Card style={styles.addCard}>
            <View style={styles.addHead}>
              <Mascot pose="peek" size={76} decorative tappable />
              <View style={styles.flex}>
                <AppText variant="headline" accessibilityRole="header">{t('Stock your pantry')}</AppText>
                <AppText variant="subhead">{t('Pick a shelf, then tap what you already have. Kelmi keeps it off your grocery list.')}</AppText>
              </View>
            </View>

            {full ? <PlusNotice text={t('Free pantries hold {n} items. Kelmi Plus has no limit.', { n: FREE_PANTRY_LIMIT })} /> : null}

            <View style={styles.pickRow} accessibilityRole="radiogroup" accessibilityLabel={t('Shelf')}>
              {SHELVES.map((s) => {
                const on = shelf === s.name;
                const here = pantry.find((p) => p.name === s.name)?.items.length ?? 0;
                return (
                  <Pressable
                    key={s.name}
                    accessibilityRole="radio"
                    accessibilityLabel={here > 0 ? `${tx(s.name)}, ${here}` : tx(s.name)}
                    accessibilityState={{ checked: on }}
                    onPress={() => {
                      haptic.select();
                      picked.current = true;
                      setShelf(s.name);
                      setShowAll(false);
                    }}
                    style={[styles.pick, { backgroundColor: on ? c.primary : c.bg, borderColor: on ? c.primary : c.line }]}
                  >
                    <Ionicons name={s.icon} size={20} color={on ? c.onPrimary : c.primaryText} />
                    <AppText variant="footnote" weight="600" color={on ? c.onPrimary : c.text} numberOfLines={1} adjustsFontSizeToFit>{tx(s.name)}</AppText>
                    <AppText variant="footnote" weight="600" color={on ? c.onPrimary : c.muted} style={styles.pickCount}>{here}</AppText>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.quick}>
              <AppText variant="eyebrow">{t('Look up a food. It goes on {shelf}', { shelf: tx(shelf) })}</AppText>
              <View style={styles.inputRow}>
                <TextInput
                  accessibilityLabel={t('New pantry item')}
                  placeholder={t('Search foods, like rice')}
                  placeholderTextColor={c.muted}
                  value={draft}
                  onChangeText={typeDraft}
                  onSubmitEditing={submit}
                  returnKeyType="done"
                  blurOnSubmit={false}
                  maxLength={80}
                  style={[styles.input, styles.flex, { backgroundColor: c.bg, color: c.text, borderColor: c.control }]}
                />
                <IconButton icon="add" label={t('Add to {shelf}', { shelf: tx(shelf) })} onPress={submit} />
              </View>
              {suggestions.length > 0 ? (
                <View style={styles.chips}>
                  {suggestions.map((name) => (
                    <PressableScale
                      key={name}
                      accessibilityRole="button"
                      accessibilityLabel={tx(name)}
                      to={0.93}
                      onPress={() => addFood(name)}
                      style={[styles.suggest, { borderColor: c.control, borderStyle: 'solid' }]}
                    >
                      <Ionicons name="add" size={14} color={c.primaryText} />
                      <AppText variant="subhead">{tx(name)}</AppText>
                    </PressableScale>
                  ))}
                </View>
              ) : null}
              {unknown ? (
                <View style={[styles.note, { backgroundColor: c.warnBg }]} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={c.warn} />
                  <AppText variant="footnote" color={c.warn} weight="600" style={styles.flex}>
                    {t('Kelmi doesn’t know “{food}” as a food yet. Pick one from the suggestions or the list below.', { food: unknown })}
                  </AppText>
                </View>
              ) : null}
              {draftHits.length > 0 ? (
                <View style={[styles.note, { backgroundColor: c.warnBg }]} accessibilityRole="alert">
                  <Ionicons name="alert-circle" size={16} color={c.warn} />
                  <AppText variant="footnote" color={c.warn} weight="600" style={styles.flex}>
                    {t('This looks like it contains {allergens}, which you avoid.', { allergens: andList(draftHits) })}
                  </AppText>
                </View>
              ) : null}
            </View>

            <View style={styles.quick}>
              <AppText variant="eyebrow">{t('Common on this shelf')}</AppText>
              <View style={styles.chips}>
                {visibleCommon.map((name) => {
                  const hits = allergensIn(name, allergies);
                  const have = !!shelfOf(name);
                  return (
                    <PressableScale
                      key={name}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: have }}
                      accessibilityLabel={
                        hits.length ? t('{item}. Contains {allergens}, which you avoid', { item: tx(name), allergens: andList(hits) }) : tx(name)
                      }
                      to={0.93}
                      onPress={() => toggleCommon(name)}
                      style={[
                        styles.suggest,
                        have
                          ? { borderColor: c.primary, backgroundColor: c.tint, borderStyle: 'solid' }
                          : { borderColor: hits.length ? `${c.warn}8C` : c.control, backgroundColor: hits.length ? c.warnBg : 'transparent' },
                      ]}
                    >
                      <Ionicons
                        name={have ? 'checkmark' : hits.length ? 'alert-circle' : 'add'}
                        size={14}
                        color={have ? c.primaryText : hits.length ? c.warn : c.primaryText}
                      />
                      <AppText variant="subhead" weight={have ? '600' : undefined} color={hits.length && !have ? c.warn : c.text}>{tx(name)}</AppText>
                    </PressableScale>
                  );
                })}
              </View>
              {common.length > COMMON_PREVIEW ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showAll }}
                  onPress={() => {
                    haptic.select();
                    animateLayout();
                    setShowAll((v) => !v);
                  }}
                  hitSlop={6}
                  style={styles.showMore}
                >
                  <AppText variant="subhead" weight="600" color={c.primaryText}>
                    {showAll ? t('Show fewer') : t('Show all {n}', { n: common.length })}
                  </AppText>
                  <Ionicons name={showAll ? 'chevron-up' : 'chevron-down'} size={16} color={c.primaryText} />
                </Pressable>
              ) : null}
            </View>

            <View style={styles.addActions}>
              <TextButton label={t('Done')} onPress={closeAdd} />
            </View>
          </Card>
        </Reveal>
      ) : null}

      {count > 0 && !adding ? (
        <Reveal>
          <View style={[styles.summary, { backgroundColor: c.tint }]}>
            <View style={styles.summaryText}>
              <AppText style={[styles.summaryNum, { color: c.primaryText }]}>{count}</AppText>
              <AppText variant="headline">{tn(count, 'item on hand', 'items on hand')}</AppText>
              <AppText variant="subhead" color={c.text}>
                {pantrySavings > 0
                  ? t('Kept off your list, saving about {amount} this week.', { amount: money(pantrySavings) })
                  : t('Kelmi leaves these off your grocery list.')}
              </AppText>
            </View>
            <Mascot pose="yum" size={104} tappable label={t('Pip, Kelmi\'s jar, enjoying a snack')} style={styles.pip} />
            {/* Coins drop in whenever the pantry saves more than it did a moment ago. */}
            <LottieOnce name="coins" size={96} trigger={savingsGrew} style={styles.coins} />
          </View>
        </Reveal>
      ) : null}

      {flagged.length > 0 ? (
        <Reveal>
          <View style={[styles.warnCard, { backgroundColor: c.warnBg }]} accessibilityRole="alert">
            <Ionicons name="alert-circle" size={20} color={c.warn} style={styles.warnIcon} />
            <View style={styles.flex}>
              <AppText variant="headline" color={c.warn}>
                {tn(flagged.length, '{n} item has an allergen you avoid', '{n} items have allergens you avoid')}
              </AppText>
              <AppText variant="subhead" color={c.warn}>
                {flagged.map((f) => `${tx(f.item)} (${allergenNames(f.hits).join(comma())})`).join(comma())}.
              </AppText>
              <AppText variant="footnote" color={c.warn}>
                {t('Kelmi checks item names only. Read every label, since products can hide allergens, and keep these away from anyone who is allergic.')}
              </AppText>
            </View>
          </View>
        </Reveal>
      ) : null}

      {count === 0 && !adding ? (
        <View style={styles.empty}>
          <Mascot pose="peek" size={120} tappable decorative />
          <AppText variant="headline">{t('Your pantry is empty')}</AppText>
          <AppText variant="subhead" style={styles.center}>
            {t('Add what you already have, like rice or olive oil, and Kelmi leaves it off your grocery list.')}
          </AppText>
          <TextButton label={t('Add an Item')} onPress={() => setAdding(true)} />
        </View>
      ) : null}

      {editing ? (
        <Reveal lift={6}>
          <View style={[styles.editBanner, { backgroundColor: c.tint }]}>
            <Ionicons name="swap-vertical" size={18} color={c.primaryText} />
            <AppText variant="footnote" color={c.text} style={styles.flex}>
              {t('Tap an item to remove it. Use the arrows to move a shelf up or down.')}
            </AppText>
          </View>
        </Reveal>
      ) : null}

      <Reveal><LeftoversSection /></Reveal>

      {shown.map((s, si) => (
        <Reveal key={s.name} index={si}>
          <ShelfCard pulse={moved?.name === s.name ? moved.n : 0}>
            <View style={styles.shelfHead}>
              <ShelfBadge name={s.name} icon={shelfIcon(s.name)} count={s.items.length} index={si} />
              <AppText style={styles.shelfName} accessibilityRole="header">{tx(s.name)}</AppText>
              {flagged.some((f) => f.shelf === s.name) ? (
                <View style={styles.shelfWarn}>
                  <Ionicons name="alert-circle" size={15} color={c.warn} />
                  <AppText variant="footnote" weight="700" color={c.warn}>{flagged.filter((f) => f.shelf === s.name).length}</AppText>
                </View>
              ) : null}
              <AppText variant="subhead" style={[styles.shelfCount, { backgroundColor: c.tint, color: c.primaryText }]}>{s.items.length}</AppText>
              {editing ? (
                <View style={styles.moveRow}>
                  {([-1, 1] as const).map((by) => {
                    const off = by === -1 ? si === 0 : si === shown.length - 1;
                    return (
                      <PressableScale
                        key={by}
                        accessibilityRole="button"
                        accessibilityState={{ disabled: off }}
                        accessibilityLabel={by === -1 ? t('Move {shelf} up', { shelf: tx(s.name) }) : t('Move {shelf} down', { shelf: tx(s.name) })}
                        to={0.85}
                        onPress={off ? undefined : () => moveShelf(s.name, by)}
                        style={[styles.move, { backgroundColor: c.tint, opacity: off ? 0.3 : 1 }]}
                      >
                        <Ionicons name={by === -1 ? 'chevron-up' : 'chevron-down'} size={18} color={c.primaryText} />
                      </PressableScale>
                    );
                  })}
                </View>
              ) : null}
            </View>
            <View style={styles.items}>
              {s.items.map((item, i) => {
                const hits = allergensIn(item, allergies);
                const bad = hits.length > 0;
                return (
                  <Wiggle key={item} active={editing} seed={i}>
                    <PressableScale
                      accessibilityRole={editing ? 'button' : 'text'}
                      accessibilityLabel={
                        editing
                          ? t('Remove {item}', { item: tx(item) })
                          : bad
                            ? t('{item}. Contains {allergens}, which you avoid', { item: tx(item), allergens: andList(hits) })
                            : tx(item)
                      }
                      accessibilityHint={editing ? undefined : t('Press and hold to edit the shelf')}
                      to={0.92}
                      // Press and hold starts editing, like rearranging icons on the iOS home screen.
                      onLongPress={() => {
                        if (editing) return;
                        haptic.success();
                        setEditing(true);
                      }}
                      onPress={() => {
                        if (!editing) return;
                        haptic.tap();
                        animateLayout();
                        removePantryItem(s.name, item);
                      }}
                      style={({ pressed }) => [
                        styles.item,
                        {
                          backgroundColor: bad ? c.warnBg : c.bg,
                          // A flagged chip keeps the same hairline and shadow as the rest; only its color changes, and softly.
                          borderColor: bad ? `${c.warn}59` : editing ? c.control : c.line,
                          opacity: pressed ? 0.7 : 1,
                        },
                      ]}
                    >
                      {bad ? <Ionicons name="alert-circle" size={16} color={c.warn} /> : null}
                      {/* One line, so a flagged item is as tall as its neighbors: the allergen follows the name instead of sitting under it. */}
                      <AppText style={[styles.itemText, bad && { color: c.warn }]}>
                        {tx(item)}
                        {bad ? (
                          <AppText variant="footnote" weight="600" color={c.warn}>
                            {` · ${allergenNames(hits).join(comma())}`}
                          </AppText>
                        ) : null}
                      </AppText>
                      {editing ? <Ionicons name="close" size={14} color={bad ? c.warn : c.text} /> : null}
                    </PressableScale>
                  </Wiggle>
                );
              })}
            </View>
            <Image
              source={require('../../../assets/shelves/shelf1.png')}
              style={styles.shelf}
              resizeMode="stretch"
              accessibilityElementsHidden
              importantForAccessibility="no"
            />
          </ShelfCard>
        </Reveal>
      ))}
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  empty: { alignItems: 'center', gap: 4, paddingVertical: 8 },
  center: { textAlign: 'center' },
  addCard: { padding: 14, gap: 12 },
  input: { minHeight: 46, borderWidth: 1.5, borderRadius: radius.control, paddingHorizontal: 12, fontSize: 17, fontFamily: fonts.regular },
  addHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pickRow: { flexDirection: 'row', gap: 6 },
  pick: { flex: 1, minHeight: 68, paddingHorizontal: 2, paddingVertical: 8, borderRadius: radius.control, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },
  pickCount: { fontVariant: ['tabular-nums'] },
  showMore: { alignSelf: 'flex-start', minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  quick: { gap: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggest: { minHeight: 36, paddingLeft: 8, paddingRight: 12, borderRadius: radius.pill, borderWidth: 1.5, borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', gap: 4 },
  addActions: { alignItems: 'flex-end' },
  summary: { borderRadius: radius.card, paddingLeft: 16, paddingRight: 6, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  summaryText: { flex: 1, gap: 2 },
  summaryNum: { fontFamily: fonts.display, fontSize: 44, lineHeight: 48, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  pip: { marginVertical: -8 },
  coins: { position: 'absolute', right: 76, bottom: -6 },
  editHint: { paddingHorizontal: 6 },
  note: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: radius.control },
  warnCard: { borderRadius: radius.card, padding: 14, flexDirection: 'row', gap: 10, marginBottom: 6 },
  warnIcon: { marginTop: 1 },
  shelfWarn: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  shelfHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4 },
  moveRow: { flexDirection: 'row', gap: 6, marginLeft: 2 },
  move: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  editBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.control, marginBottom: 6 },
  shelfName: { fontFamily: fonts.displaySemi, fontSize: 19, lineHeight: 24, letterSpacing: -0.2, flex: 1 },
  shelfCount: { fontVariant: ['tabular-nums'], minWidth: 26, textAlign: 'center', paddingVertical: 2, paddingHorizontal: 8, borderRadius: radius.pill, overflow: 'hidden' },
  items: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 4 },
  item: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    shadowColor: '#13241A',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  itemText: { fontSize: 15, fontWeight: '500' },
  // The chips rest on the shelf: its art has a transparent top edge, so it tucks up under the last row.
  shelf: { width: '100%', height: 26, marginTop: -14, opacity: 0.9 },
});
