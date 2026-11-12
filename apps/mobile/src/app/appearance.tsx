import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { Card, IconButton } from '../components/Buttons';
import { useT } from '../i18n';
import { setAppearance, useAppearance, type AppearanceChoice } from '../lib/appearance';
import { haptic } from '../motion';
import { modalEdges } from '../navigation';
import { space, useTheme } from '../theme';

// Light, dark, or whatever the phone is set to, opened from Settings. Light is the default.
export default function AppearanceScreen() {
  const c = useTheme();
  const { t } = useT();
  const choice = useAppearance();

  const options: { id: AppearanceChoice; title: string; detail: string }[] = [
    { id: 'light', title: t('Light'), detail: t('The default') },
    { id: 'dark', title: t('Dark'), detail: t('Easier on the eyes at night') },
    { id: 'system', title: t('Same as phone'), detail: t('Follows your phone\'s setting') },
  ];

  const pick = (next: AppearanceChoice) => {
    if (next === choice) return;
    haptic.select();
    setAppearance(next);
  };

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <AppText variant="headline" style={styles.flex} accessibilityRole="header">{t('Appearance')}</AppText>
        <IconButton icon="close" label={t('Close')} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.group}>
          {options.map((o, i) => (
            <Pressable
              key={o.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: choice === o.id }}
              accessibilityLabel={`${o.title}, ${o.detail}`}
              onPress={() => pick(o.id)}
              style={({ pressed }) => [
                styles.row,
                i === 0 ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
                { opacity: pressed ? 0.6 : 1 },
              ]}
            >
              <View style={styles.flex}>
                <AppText weight={choice === o.id ? '600' : undefined}>{o.title}</AppText>
                <AppText variant="footnote">{o.detail}</AppText>
              </View>
              {choice === o.id ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
            </Pressable>
          ))}
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.gutter, paddingRight: 12, paddingTop: 8, paddingBottom: 4 },
  content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 32, gap: 8 },
  group: { overflow: 'hidden' },
  row: { minHeight: 56, marginHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
