import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useT } from '../i18n';
import { PLUS_ENABLED } from '../lib/flags';
import { openPlus, type PlusFeature } from '../lib/plusFeatures';
import { radius, useTheme } from '../theme';
import { AppText } from './AppText';
import { TextButton } from './Buttons';

export { FREE_PANTRY_LIMIT } from '../lib/limits';

// A screen reader label for a locked control: "Swap Monday dinner, a Kelmi Plus feature". Plus members get it unchanged.
export function usePlusLabel() {
  const { t } = useT();
  return (label: string, plus: boolean) => (plus || !PLUS_ENABLED ? label : t('{action}, a Kelmi Plus feature', { action: label }));
}

// A short note where a Plus feature sits behind the free plan: a lock, one sentence, and the way to see what Plus adds.
export function PlusNotice({ text, feature }: { text: string; feature?: PlusFeature }) {
  const c = useTheme();
  const { t } = useT();
  // Nothing is for sale yet, so there is nothing to point at.
  if (!PLUS_ENABLED) return null;
  return (
    <View style={[styles.box, { backgroundColor: c.tint }]}>
      <Ionicons name="lock-closed" size={18} color={c.primaryText} style={styles.icon} />
      <View style={styles.body}>
        <AppText variant="subhead" color={c.text}>{text}</AppText>
        <TextButton label={t('See What Plus Adds')} onPress={() => (feature ? openPlus(feature) : router.push('/plus'))} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: 'row', gap: 10, padding: 14, borderRadius: radius.control },
  icon: { marginTop: 2 },
  body: { flex: 1, alignItems: 'flex-start', gap: 2 },
});
