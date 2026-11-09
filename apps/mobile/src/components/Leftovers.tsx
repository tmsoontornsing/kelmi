import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { MEAL_LABELS, type Leftover, type PlannedMeal } from '../data/mock';
import { useT } from '../i18n';
import { animateLayout, haptic } from '../motion';
import { useApp } from '../state/AppState';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { Card, IconButton, PrimaryButton, TextButton } from './Buttons';

// Meals already cooked with servings left. A leftover can fill a meal later in the week, so Kelmi stops buying ingredients
// for that meal, in whole or in part when there aren't enough servings for everyone.
export function LeftoversSection() {
  const c = useTheme();
  const app = useApp();
  const { t, tn, tx } = useT();

  const [adding, setAdding] = useState(false);
  const [recipe, setRecipe] = useState<PlannedMeal | null>(null);
  const [servings, setServings] = useState(app.people);
  const [placing, setPlacing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Each recipe once, for the "what did you cook" choices.
  const cookable = app.plan.filter((m, i, all) => all.findIndex((x) => x.id === m.id) === i);
  // Meals still ahead this week that are being cooked, where a leftover can go.
  const today = (new Date().getDay() + 6) % 7;
  const open = app.plan.filter((m) => Math.floor(m.slot / 3) >= today && m.status !== 'skip' && !m.conflict && !m.leftoverId);
  const slotOf = (id: string) => app.plan.find((m) => m.leftoverId === id);
  const slotName = (m: PlannedMeal) => `${tx(m.dayLong)} ${tx(MEAL_LABELS[m.type]).toLowerCase()}`;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      Alert.alert(t('Something went wrong. Try again.'), (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    recipe &&
    run(async () => {
      await app.addLeftovers(recipe.id, recipe.name, servings);
      haptic.success();
      animateLayout();
      setAdding(false);
      setRecipe(null);
    });

  return (
    <Card style={styles.card}>
      <View style={styles.head}>
        <View style={styles.flex}>
          <AppText variant="headline" accessibilityRole="header">{t('Leftovers')}</AppText>
          <AppText variant="subhead">{t('Cooked more than you ate? Put it in a later meal and Kelmi buys less.')}</AppText>
        </View>
        {!adding && app.plan.length > 0 ? (
          <IconButton icon="add" label={t('Add leftovers')} onPress={() => { animateLayout(); setAdding(true); setServings(app.people); }} />
        ) : null}
      </View>

      {adding ? (
        <View style={styles.form}>
          <AppText variant="eyebrow">{t('What did you cook?')}</AppText>
          <View style={styles.chips}>
            {cookable.map((m) => {
              const on = recipe?.id === m.id;
              return (
                <Pressable
                  key={m.id}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => { haptic.select(); setRecipe(m); }}
                  style={[styles.chip, { backgroundColor: on ? c.primary : c.bg, borderColor: on ? c.primary : c.line }]}
                >
                  <AppText variant="subhead" weight="600" color={on ? c.onPrimary : c.text} numberOfLines={1}>{tx(m.name)}</AppText>
                </Pressable>
              );
            })}
          </View>
          <AppText variant="eyebrow">{t('Servings left')}</AppText>
          <View style={styles.stepper}>
            <IconButton icon="remove" label={t('Fewer servings')} onPress={() => setServings((n) => Math.max(1, n - 1))} />
            <AppText variant="title" style={styles.count} accessibilityLabel={tn(servings, '{n} serving', '{n} servings')}>{servings}</AppText>
            <IconButton icon="add" label={t('More servings')} onPress={() => setServings((n) => Math.min(24, n + 1))} />
          </View>
          <PrimaryButton label={t('Save leftovers')} onPress={save} feedback="none" />
          <TextButton label={t('Cancel')} color={c.muted} onPress={() => { animateLayout(); setAdding(false); setRecipe(null); }} />
        </View>
      ) : null}

      {app.leftovers.length === 0 && !adding ? (
        <AppText variant="subhead" color={c.muted}>{app.plan.length === 0 ? t('Plan your week to track leftovers.') : t('No leftovers right now.')}</AppText>
      ) : null}

      {app.leftovers.map((l: Leftover) => {
        const used = slotOf(l.id);
        const showPicker = placing === l.id;
        return (
          <View key={l.id} style={[styles.item, { borderTopColor: c.line }]}>
            <View style={styles.itemHead}>
              <View style={styles.flex}>
                <AppText weight="600">{tx(l.name)}</AppText>
                <AppText variant="footnote">
                  {tn(l.servings, '{n} serving left', '{n} servings left')}
                  {used ? ` · ${t('Planned for {slot}', { slot: slotName(used) })}` : ''}
                </AppText>
              </View>
              <IconButton
                icon="trash-outline"
                label={t('Remove leftovers: {name}', { name: tx(l.name) })}
                onPress={() => run(() => app.removeLeftover(l.id))}
              />
            </View>
            {used ? (
              <TextButton
                label={t('Don’t use it in {slot}', { slot: slotName(used) })}
                color={c.muted}
                onPress={() => run(() => app.assignLeftover(used.slot, null))}
              />
            ) : (
              <>
                <TextButton
                  label={showPicker ? t('Hide meals') : t('Use in a meal')}
                  onPress={() => { animateLayout(); setPlacing(showPicker ? null : l.id); }}
                />
                {showPicker ? (
                  open.length === 0 ? (
                    <AppText variant="footnote">{t('No meals left this week to put it in.')}</AppText>
                  ) : (
                    <View style={styles.chips}>
                      {open.map((m) => (
                        <Pressable
                          key={m.slot}
                          accessibilityRole="button"
                          accessibilityLabel={t('Use in {slot}: {name}', { slot: slotName(m), name: tx(m.name) })}
                          onPress={() =>
                            run(async () => {
                              await app.assignLeftover(m.slot, l.id);
                              haptic.success();
                              setPlacing(null);
                            })
                          }
                          style={[styles.chip, { backgroundColor: c.tint, borderColor: c.line }]}
                        >
                          <Ionicons name="return-down-forward-outline" size={14} color={c.primaryText} />
                          <AppText variant="subhead" weight="600">{slotName(m)}</AppText>
                        </Pressable>
                      ))}
                    </View>
                  )
                ) : null}
              </>
            )}
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { padding: 14, gap: 10, marginBottom: 6 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  form: { gap: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  count: { minWidth: 36, textAlign: 'center', fontVariant: ['tabular-nums'] },
  item: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, gap: 4 },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});
