import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { Card, IconButton } from '../components/Buttons';
import { useT } from '../i18n';
import { modalEdges } from '../navigation';
import { space, useTheme } from '../theme';

// The open-source software Kelmi is built with, by licence. Read from package.json and each package's own licence field.
// Names and licences are proper names, so they are not translated.
const GROUPS: { id: 'fonts' | 'framework' | 'libraries'; items: [string, string][] }[] = [
  {
    id: 'fonts',
    items: [
      ['Outfit (@expo-google-fonts/outfit)', 'SIL Open Font License 1.1'],
      ['Ionicons (@expo/vector-icons)', 'MIT'],
    ],
  },
  {
    id: 'framework',
    items: [
      ['React', 'MIT'],
      ['React Native', 'MIT'],
      ['Expo and the Expo modules Kelmi uses', 'MIT'],
      ['Expo Router', 'MIT'],
      ['react-native-screens', 'MIT'],
      ['react-native-safe-area-context', 'MIT'],
    ],
  },
  {
    id: 'libraries',
    items: [
      ['Supabase JavaScript client', 'MIT'],
      ['lottie-react-native', 'Apache License 2.0'],
      ['react-native-svg', 'MIT'],
      ['react-native-view-shot', 'MIT'],
      ['@react-native-async-storage/async-storage', 'MIT'],
      ['@react-native-community/slider', 'MIT'],
      ['@react-native-community/datetimepicker', 'MIT'],
      ['@react-native-google-signin/google-signin', 'MIT'],
      ['react-native-purchases (RevenueCat)', 'MIT'],
      ['posthog-react-native', 'MIT'],
      ['aes-js', 'MIT'],
    ],
  },
];

export default function Acknowledgements() {
  const c = useTheme();
  const { t } = useT();
  const titles = { fonts: t('Typeface and icons'), framework: t('Framework'), libraries: t('Libraries') };
  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <AppText variant="headline" style={styles.flex} accessibilityRole="header">
          {t('Acknowledgements')}
        </AppText>
        <IconButton icon="close" label={t('Close')} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText color={c.muted}>{t('Kelmi is built with open-source software. Thank you to the people who make and maintain it.')}</AppText>
        {GROUPS.map((g) => (
          <View key={g.id} style={styles.group}>
            <AppText variant="eyebrow" accessibilityRole="header">{titles[g.id]}</AppText>
            <Card style={styles.card}>
              {g.items.map(([name, licence], i) => (
                <View key={name} style={[styles.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <AppText style={styles.flex}>{name}</AppText>
                  <AppText variant="subhead" color={c.muted}>{licence}</AppText>
                </View>
              ))}
            </Card>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.gutter, paddingRight: 12, paddingTop: 8 },
  content: { paddingHorizontal: space.gutter, paddingVertical: 12, gap: 18 },
  group: { gap: 6 },
  card: { paddingHorizontal: 16 },
  row: { minHeight: 48, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
});
