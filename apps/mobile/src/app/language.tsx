import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../components/AppText';
import { Card, IconButton } from '../components/Buttons';
import { LANGUAGES, systemLanguage, useLanguage, useT, type LanguageChoice } from '../i18n';
import { haptic } from '../motion';
import { modalEdges } from '../navigation';
import { space, useTheme } from '../theme';

// The language picker, opened from Settings. Picking a row switches the whole app at once, menus included.
export default function LanguageScreen() {
  const c = useTheme();
  const { t } = useT();
  const { choice, setChoice } = useLanguage();
  const phone = LANGUAGES.find((l) => l.code === systemLanguage())!;

  const pick = (next: LanguageChoice) => {
    if (next === choice) return;
    haptic.select();
    setChoice(next);
  };

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <AppText variant="headline" style={styles.flex} accessibilityRole="header">{t('Language')}</AppText>
        <IconButton icon="close" label={t('Close')} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.group}>
          <Row
            title={t('Same as phone')}
            detail={phone.native}
            selected={choice === 'system'}
            onPress={() => pick('system')}
            first
          />
          {LANGUAGES.map((l) => (
            <Row
              key={l.code}
              title={l.native}
              detail={t(l.english)}
              selected={choice === l.code}
              onPress={() => pick(l.code)}
            />
          ))}
        </Card>
        <AppText variant="footnote" style={styles.note}>
          {t('Recipes, ingredients, and your grocery list switch too. The Terms of Service and Privacy Policy stay in English.')}
        </AppText>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  title,
  detail,
  selected,
  onPress,
  first,
}: {
  title: string;
  detail: string;
  selected: boolean;
  onPress: () => void;
  first?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${title}, ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        first ? null : { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
        { opacity: pressed ? 0.6 : 1 },
      ]}
    >
      <View style={styles.flex}>
        <AppText weight={selected ? '600' : undefined}>{title}</AppText>
        {detail !== title ? <AppText variant="footnote">{detail}</AppText> : null}
      </View>
      {selected ? <Ionicons name="checkmark" size={20} color={c.primary} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1, gap: 2 },
  top: { flexDirection: 'row', alignItems: 'center', paddingLeft: space.gutter, paddingRight: 12, paddingTop: 8, paddingBottom: 4 },
  content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 32, gap: 8 },
  group: { overflow: 'hidden' },
  row: { minHeight: 56, marginHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  note: { paddingHorizontal: 16 },
});
