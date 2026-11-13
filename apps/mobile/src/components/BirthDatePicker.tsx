import Ionicons from '@expo/vector-icons/Ionicons';
import { useMemo, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useLanguage, useT } from '../i18n';
import { haptic } from '../motion';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';

export type BirthDate = { year: number; month: number; day: number };

const OLDEST = 110;

const fmt = (lang: string, d: Date, opts: Intl.DateTimeFormatOptions, fallback: string) => {
  try {
    return d.toLocaleDateString(lang, opts);
  } catch {
    return fallback;
  }
};

type Cell = (label: string, selected: boolean, disabled: boolean, onPress: () => void, wrap: object, a11y?: string) => ReactElement;

// A calendar for a birth date. Nothing is pre-selected and it starts at the year, because paging back through
// decades of months is no way to find 1988: pick the year, then the month, then the day (tap the title to go back up).
// Days after today can't be chosen. Calls onChange with the date once a day is picked, and with null whenever the
// person goes back to change the year or month, so Continue never acts on a half-finished answer.
export function BirthDatePicker({ onChange }: { onChange: (date: BirthDate | null) => void }) {
  const c = useTheme();
  const { t } = useT();
  const { lang } = useLanguage();

  const today = new Date();
  const thisYear = today.getFullYear();
  const [stage, setStage] = useState<'year' | 'month' | 'day'>('year');
  const [year, setYear] = useState<number | null>(null);
  const [month, setMonth] = useState<number | null>(null); // 1-12
  const [day, setDay] = useState<number | null>(null);

  const years = useMemo(() => Array.from({ length: OLDEST + 1 }, (_, i) => thisYear - i), [thisYear]);
  const monthNames = useMemo(
    () => Array.from({ length: 12 }, (_, i) => fmt(lang, new Date(2000, i, 1), { month: 'short' }, String(i + 1))),
    [lang],
  );
  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => fmt(lang, new Date(2023, 0, 1 + i), { weekday: 'narrow' }, String(i + 1))),
    [lang],
  );

  const pickYear = (y: number) => {
    haptic.select();
    setYear(y);
    setMonth(null);
    setDay(null);
    onChange(null);
    setStage('month');
  };
  const pickMonth = (m: number) => {
    haptic.select();
    setMonth(m);
    setDay(null);
    onChange(null);
    setStage('day');
  };
  const pickDay = (d: number) => {
    haptic.select();
    setDay(d);
    onChange({ year: year!, month: month!, day: d });
  };
  const up = () => {
    haptic.select();
    setDay(null);
    onChange(null);
    setStage(stage === 'day' ? 'month' : 'year');
  };
  // Previous or next month, within the years the calendar allows.
  const step = (by: -1 | 1) => {
    if (year === null || month === null) return;
    let y = year;
    let m = month + by;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    if (y > thisYear || y < thisYear - OLDEST) return;
    if (y === thisYear && m > today.getMonth() + 1) return;
    haptic.select();
    setYear(y);
    setMonth(m);
    setDay(null);
    onChange(null);
  };

  const cell: Cell = (label, selected, disabled, onPress, wrap, a11y) => (
    <View key={label + (a11y ?? '')} style={wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={a11y ?? label}
        accessibilityState={{ selected, disabled }}
        disabled={disabled}
        onPress={onPress}
        style={[styles.cell, { backgroundColor: selected ? c.primary : c.bg, borderColor: selected ? c.primary : c.line, opacity: disabled ? 0.35 : 1 }]}
      >
        <AppText weight="600" color={selected ? c.onPrimary : c.text} numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );

  // The title row: what you are choosing, and a way back up.
  const title =
    stage === 'year'
      ? t('Birth year')
      : stage === 'month'
        ? String(year)
        : fmt(lang, new Date(year!, month! - 1, 1), { month: 'long', year: 'numeric' }, `${month}/${year}`);

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        {stage === 'day' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Previous month')} onPress={() => step(-1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-back" size={22} color={c.text} />
          </Pressable>
        ) : (
          <View style={styles.arrow} />
        )}
        <Pressable accessibilityRole={stage === 'year' ? 'header' : 'button'} disabled={stage === 'year'} onPress={up} style={styles.titleRow}>
          <AppText variant="eyebrow" color={stage === 'year' ? c.muted : c.text}>
            {title}
          </AppText>
          {stage !== 'year' ? <Ionicons name="chevron-up" size={16} color={c.muted} /> : null}
        </Pressable>
        {stage === 'day' ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('Next month')} onPress={() => step(1)} hitSlop={10} style={styles.arrow}>
            <Ionicons name="chevron-forward" size={22} color={c.text} />
          </Pressable>
        ) : (
          <View style={styles.arrow} />
        )}
      </View>

      {stage === 'year' ? (
        <ScrollView style={styles.years} nestedScrollEnabled showsVerticalScrollIndicator>
          <View style={styles.grid}>{years.map((y) => cell(String(y), year === y, false, () => pickYear(y), styles.quarter))}</View>
        </ScrollView>
      ) : null}

      {stage === 'month' ? (
        <View style={styles.grid}>
          {monthNames.map((name, i) =>
            cell(name, month === i + 1, year === thisYear && i + 1 > today.getMonth() + 1, () => pickMonth(i + 1), styles.quarter),
          )}
        </View>
      ) : null}

      {stage === 'day' ? (
        <DayGrid year={year!} month={month!} day={day} today={today} weekdays={weekdays} lang={lang} onPick={pickDay} cell={cell} />
      ) : null}
    </View>
  );
}

function DayGrid({
  year,
  month,
  day,
  today,
  weekdays,
  lang,
  onPick,
  cell,
}: {
  year: number;
  month: number;
  day: number | null;
  today: Date;
  weekdays: string[];
  lang: string;
  onPick: (d: number) => void;
  cell: Cell;
}) {
  const c = useTheme();
  const lead = new Date(year, month - 1, 1).getDay(); // Sunday first, matching the weekday row
  const count = new Date(year, month, 0).getDate();
  const isThisMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  return (
    <View>
      <View style={styles.grid}>
        {weekdays.map((w, i) => (
          <View key={w + i} style={styles.seventh}>
            <AppText variant="footnote" color={c.muted} style={styles.center}>
              {w}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.grid}>
        {Array.from({ length: lead }, (_, i) => (
          <View key={'b' + i} style={styles.seventh} />
        ))}
        {Array.from({ length: count }, (_, i) => {
          const d = i + 1;
          const label = fmt(lang, new Date(year, month - 1, d), { dateStyle: 'long' } as Intl.DateTimeFormatOptions, String(d));
          return cell(String(d), day === d, isThisMonth && d > today.getDate(), () => onPick(d), styles.seventh, label);
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 36 },
  arrow: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 },
  years: { maxHeight: 300 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { minHeight: 44, margin: 2, alignItems: 'center', justifyContent: 'center', borderRadius: radius.control, borderWidth: 1 },
  quarter: { width: '25%' },
  seventh: { width: '14.2857%' },
  center: { textAlign: 'center' },
});
