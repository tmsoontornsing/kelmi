import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { useLanguage } from '../i18n';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';

export type BirthDate = { year: number; month: number; day: number };

const OLDEST = 110;
// Where the wheels rest before the person touches them. It is only a starting position: nothing counts as an answer
// until they move a wheel, so Continue can never act on this date by accident.
const START_YEARS_AGO = 25;

// The standard system date picker (spinning month / day / year wheels on iOS, the system dialog on Android).
// Calls onChange with the date once the person has chosen one, and with null until then. Future dates can't be chosen.
export function BirthDatePicker({ onChange }: { onChange: (date: BirthDate | null) => void }) {
  const c = useTheme();
  const { lang } = useLanguage();
  const today = useMemo(() => new Date(), []);
  const start = useMemo(() => new Date(today.getFullYear() - START_YEARS_AGO, 5, 15), [today]);
  const oldest = useMemo(() => new Date(today.getFullYear() - OLDEST, 0, 1), [today]);
  const [value, setValue] = useState<Date>(start);
  const [chosen, setChosen] = useState(false);
  const [open, setOpen] = useState(false); // Android only: the dialog is shown on demand

  const apply = (d: Date) => {
    setValue(d);
    setChosen(true);
    onChange({ year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() });
  };

  const onPick = (e: DateTimePickerEvent, d?: Date) => {
    if (Platform.OS === 'android') setOpen(false);
    if (e.type === 'set' && d) apply(d);
  };

  if (Platform.OS === 'android') {
    const label = chosen ? value.toLocaleDateString(lang, { year: 'numeric', month: 'long', day: 'numeric' }) : '—';
    return (
      <View>
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(true)}
          style={[styles.field, { backgroundColor: c.bg, borderColor: c.line }]}
        >
          <AppText variant="headline">{label}</AppText>
        </Pressable>
        {open ? (
          <DateTimePicker value={value} mode="date" display="default" minimumDate={oldest} maximumDate={today} onChange={onPick} />
        ) : null}
      </View>
    );
  }

  return (
    <DateTimePicker
      value={value}
      mode="date"
      display="spinner"
      locale={lang}
      minimumDate={oldest}
      maximumDate={today}
      onChange={onPick}
      style={styles.wheel}
    />
  );
}

const styles = StyleSheet.create({
  wheel: { alignSelf: 'center', width: '100%' },
  field: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.control, paddingVertical: 14, alignItems: 'center' },
});
