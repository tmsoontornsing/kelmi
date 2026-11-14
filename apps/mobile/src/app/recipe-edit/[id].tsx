import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Card, IconButton, PrimaryButton, TextButton } from '../../components/Buttons';
import { comma, useT } from '../../i18n';
import { allergensIn } from '../../lib/allergens';
import { friendlyAmount } from '../../lib/amounts';
import * as api from '../../lib/api';
import { PLUS_ENABLED, serverPlusUnlocked } from '../../lib/flags';
import { replaceWithPlus } from '../../lib/plusFeatures';
import { haptic } from '../../motion';
import { modalEdges } from '../../navigation';
import { useApp } from '../../state/AppState';
import { fonts, radius, space, useTheme } from '../../theme';

const STEP = 0.25;
const MAX = 4;

// A Plus member's own version of a recipe: change how much of each ingredient, drop one, rewrite the steps, add a private note.
// The catalog recipe is untouched. Amounts are saved as a factor of the original (1 is as written, 0 removes it), so they keep
// following the household size. New ingredients can't be added here, so an edit can't bring in an allergen; any words typed
// into the steps or note are still checked against the household's allergies before saving.
export default function RecipeEdit() {
  const c = useTheme();
  const app = useApp();
  const { t, tx, line } = useT();
  const { id } = useLocalSearchParams<{ id: string }>();

  // Editing recipes is part of Kelmi Plus, which is hidden until billing works. Anyone who arrives by a link is sent back.
  const allowed = serverPlusUnlocked(app.subscribed);
  useEffect(() => {
    if (!allowed) (PLUS_ENABLED ? replaceWithPlus('edit') : router.replace('/week'));
  }, [allowed]);

  const [data, setData] = useState<api.EditableRecipe | null | undefined>(undefined);
  const [factors, setFactors] = useState<Record<string, number>>({});
  const [steps, setSteps] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .loadEditable(id, app.people)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        if (d) {
          setFactors(Object.fromEntries(d.ingredients.map((i) => [i.name, i.factor])));
          setSteps(d.steps);
          setNote(d.note);
        }
      })
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [id, app.people]);

  if (!allowed) return null;
  if (data === undefined) return <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={modalEdges} />;
  if (!data) {
    return (
      <SafeAreaView style={[styles.root, styles.center, { backgroundColor: c.bg }]} edges={modalEdges}>
        <AppText>{t('This recipe isn’t available.')}</AppText>
        <TextButton label={t('Cancel')} onPress={() => router.back()} />
      </SafeAreaView>
    );
  }

  const change = (name: string, delta: number) => {
    haptic.select();
    setFactors((f) => ({ ...f, [name]: Math.min(MAX, Math.max(0, Math.round(((f[name] ?? 1) + delta) * 100) / 100)) }));
  };

  const save = async () => {
    if (busy) return;
    const typed = [...steps, note].join('\n');
    const hits = allergensIn(typed, app.allergies);
    if (hits.length > 0) {
      haptic.error();
      Alert.alert(
        t('Check your allergies'),
        t('Your edit mentions {allergens}, which you avoid. Take it out to save.', { allergens: hits.map(tx).join(comma()).toLowerCase() }),
      );
      return;
    }
    setBusy(true);
    try {
      await app.saveRecipeEdit(id, { factors, steps: steps.map((s) => s.trim()).filter(Boolean), originalSteps: data.originalSteps, note });
      haptic.success();
      router.back();
    } catch (e) {
      setBusy(false);
      Alert.alert(t('Couldn’t save your changes'), (e as Error).message);
    }
  };

  const reset = () =>
    Alert.alert(t('Go back to the original recipe?'), t('Your amounts, steps and note for this recipe will be removed.'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Reset'),
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            await app.saveRecipeEdit(id, null);
            router.back();
          } catch (e) {
            setBusy(false);
            Alert.alert(t('Couldn’t save your changes'), (e as Error).message);
          }
        },
      },
    ]);

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]} edges={modalEdges}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.head}>
            <TextButton label={t('Cancel')} onPress={() => router.back()} color={c.muted} />
          </View>
          <AppText variant="largeTitle" accessibilityRole="header">{t('Make it yours')}</AppText>
          <AppText color={c.muted}>{tx(data.title)}. {t('Change amounts, drop what you don’t use, and rewrite the steps. The original recipe stays as it is.')}</AppText>

          <AppText variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>{t('Ingredients')}</AppText>
          <Card style={styles.list}>
            {data.ingredients.map((ing, i) => {
              const f = factors[ing.name] ?? 1;
              const removed = f === 0;
              const amount = friendlyAmount(ing.quantity * f, ing.unit, app.live, ing.name);
              return (
                <View key={ing.name} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <View style={styles.flex}>
                    <AppText style={removed ? styles.struck : undefined} color={removed ? c.muted : c.text}>{line(amount ? `${ing.name}, ${amount}` : ing.name)}</AppText>
                    {f !== 1 && !removed ? <AppText variant="footnote" color={c.primaryText}>{t('{n}× the original', { n: f })}</AppText> : null}
                    {removed ? <AppText variant="footnote" color={c.warn}>{t('Left out of this recipe and your list')}</AppText> : null}
                  </View>
                  <IconButton icon="remove" label={t('Less {item}', { item: tx(ing.name) })} onPress={() => change(ing.name, -STEP)} />
                  <IconButton icon="add" label={t('More {item}', { item: tx(ing.name) })} onPress={() => change(ing.name, STEP)} />
                </View>
              );
            })}
          </Card>

          <AppText variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>{t('Steps')}</AppText>
          {steps.map((s, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepNum, { backgroundColor: c.tint }]}>
                <AppText variant="subhead" weight="700" color={c.primaryText}>{i + 1}</AppText>
              </View>
              <TextInput
                accessibilityLabel={t('Step {n}', { n: i + 1 })}
                multiline
                value={s}
                onChangeText={(v) => setSteps((l) => l.map((x, j) => (j === i ? v : x)))}
                style={[styles.input, styles.flex, { backgroundColor: c.card, color: c.text, borderColor: c.line }]}
              />
              <Pressable accessibilityRole="button" accessibilityLabel={t('Remove step {n}', { n: i + 1 })} hitSlop={8} onPress={() => setSteps((l) => l.filter((_, j) => j !== i))} style={styles.trash}>
                <Ionicons name="trash-outline" size={20} color={c.muted} />
              </Pressable>
            </View>
          ))}
          <TextButton label={t('Add a step')} onPress={() => setSteps((l) => [...l, ''])} />

          <AppText variant="eyebrow" accessibilityRole="header" style={styles.eyebrow}>{t('Your note')}</AppText>
          <TextInput
            accessibilityLabel={t('Your note')}
            multiline
            maxLength={500}
            placeholder={t('Something to remember, like “less salt next time”')}
            placeholderTextColor={c.muted}
            value={note}
            onChangeText={setNote}
            style={[styles.input, styles.noteInput, { backgroundColor: c.card, color: c.text, borderColor: c.line }]}
          />
          <AppText variant="footnote">{t('Changes use the same average prices and estimates as the rest of Kelmi. Check every label if you have an allergy.')}</AppText>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { backgroundColor: c.bg, borderTopColor: c.line }]}>
        <PrimaryButton label={busy ? t('Saving…') : t('Save my version')} onPress={save} feedback="none" loading={busy} />
        {data.ingredients.some((i) => i.factor !== 1) || data.steps.join('\n') !== data.originalSteps.join('\n') || data.note ? (
          <TextButton label={t('Back to the original')} onPress={reset} color={c.warn} />
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  head: { flexDirection: 'row', justifyContent: 'flex-start' },
  content: { paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 24, gap: 10 },
  eyebrow: { marginTop: 10 },
  list: { paddingHorizontal: 14, paddingVertical: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 60, paddingVertical: 4 },
  struck: { textDecorationLine: 'line-through' },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  stepNum: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  input: { minHeight: 46, borderRadius: radius.control, borderWidth: 1, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, fontFamily: fonts.regular, fontSize: 16 },
  noteInput: { minHeight: 90, textAlignVertical: 'top' },
  trash: { width: 36, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 10, paddingBottom: 8, gap: 2, borderTopWidth: StyleSheet.hairlineWidth },
});
