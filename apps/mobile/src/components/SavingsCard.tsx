import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { money } from '../data/mock';
import { useT } from '../i18n';
import * as api from '../lib/api';
import { computeSavings, type Savings } from '../lib/savings';
import { useApp } from '../state/AppState';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { Card } from './Buttons';
import { onDeviceUnlocked } from '../lib/flags';
import { PlusNotice } from './PlusLock';

// A running total of what Kelmi has kept off the household's grocery bill. This week's pantry saving is free everywhere in the
// app; the month and all-time view, and the comparison with the budget, are Plus. Estimates only, and worded that way.
export function SavingsCard() {
  const c = useTheme();
  const { t, tn } = useT();
  const app = useApp();
  const [userId, setUserId] = useState<string | null>(null);
  const [savings, setSavings] = useState<Savings | null>(null);

  // Reload when a list changes (a new total or a pantry change), so the card follows what's on screen.
  useEffect(() => {
    let cancelled = false;
    if (!app.live) {
      setSavings(computeSavings([{ weekStart: new Date().toISOString().slice(0, 10), total: app.groceryTotal, pantry: app.pantrySavings }], app.budget));
      return;
    }
    api.currentUserId().then((id) => {
      if (cancelled || !id) return;
      setUserId(id);
      api
        .loadSavingsRows(id)
        .then((rows) => !cancelled && setSavings(computeSavings(rows, app.budget)))
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [app.live, app.groceryTotal, app.pantrySavings, app.budget, userId]);

  if (!savings || savings.all.weeks === 0) return null;

  const net = savings.month.vsBudget;
  const stat = (label: string, value: string, note?: string) => (
    <View style={styles.stat}>
      <AppText variant="footnote">{label}</AppText>
      <AppText variant="money" style={styles.value}>{value}</AppText>
      {note ? <AppText variant="footnote">{note}</AppText> : null}
    </View>
  );

  return (
    <Card style={styles.card}>
      <AppText variant="headline" accessibilityRole="header">{t('Your savings')}</AppText>
      {stat(t('Kept off your list this week'), money(app.pantrySavings), t('Already on your pantry shelf'))}

      {onDeviceUnlocked(app.subscribed) ? (
        <>
          <View style={[styles.divider, { backgroundColor: c.line }]} />
          <View style={styles.row}>
            {stat(t('Pantry, this month'), money(savings.month.pantry))}
            {stat(
              net >= 0 ? t('Under budget, this month') : t('Over budget, this month'),
              money(Math.abs(net)),
              tn(savings.month.weeks, '{n} week', '{n} weeks'),
            )}
          </View>
          <View style={styles.row}>
            {stat(t('Pantry, all time'), money(savings.all.pantry))}
            {stat(
              t('Weeks on budget'),
              `${savings.all.underWeeks} / ${savings.all.weeks}`,
            )}
          </View>
          <AppText variant="footnote">
            {t('Estimates from average prices, compared with your budget as it is today. Your real savings will differ.')}
          </AppText>
        </>
      ) : (
        <PlusNotice text={t('See what Kelmi has saved you this month and all time, and how each week compares with your budget.')} />
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { padding: 14, gap: 10, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 12 },
  stat: { flex: 1, gap: 1 },
  value: { fontSize: 24 },
  divider: { height: StyleSheet.hairlineWidth, borderRadius: radius.pill },
});
