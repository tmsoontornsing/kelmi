import { router, useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { IconButton, TextButton } from '../../components/Buttons';
import { useT } from '../../i18n';
import { LEGAL } from '../../legal/config';
import { LEGAL_DOCS, type Block } from '../../legal/documents';
import { modalEdges, openUrl } from '../../navigation';
import { space, useTheme } from '../../theme';

// The Terms of Service, Privacy Policy or Consumer Health Data Policy, readable without leaving the app or needing a connection.
// Presented as a sheet so it opens the same way over the paywall, sign-up, or Settings.
export default function LegalScreen() {
  const c = useTheme();
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = doc === 'privacy' ? LEGAL_DOCS.privacy : doc === 'health' ? LEGAL_DOCS.consumerHealth : LEGAL_DOCS.terms;
  // The documents themselves stay in English; only the sheet around them is translated.
  const { t, lang } = useT();
  const labels = {
    terms: { title: t('Terms of Service'), close: t('Close Terms of Service'), read: t('Read the Terms of Service'), url: LEGAL.termsUrl, param: 'terms' },
    privacy: { title: t('Privacy Policy'), close: t('Close Privacy Policy'), read: t('Read the Privacy Policy'), url: LEGAL.privacyUrl, param: 'privacy' },
    'consumer-health-data': { title: t('Consumer Health Data Policy'), close: t('Close Consumer Health Data Policy'), read: t('Read the Consumer Health Data Policy'), url: LEGAL.healthUrl, param: 'health' },
  } as const;
  const here = labels[content.id];
  const others = (['terms', 'privacy', 'consumer-health-data'] as const).filter((id) => id !== content.id);

  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <AppText variant="headline" style={styles.flex} accessibilityRole="header">{here.title}</AppText>
        <IconButton icon="close" label={here.close} onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {lang !== 'en' ? (
          <AppText variant="footnote" color={c.muted}>{t('This document is available in English only.')}</AppText>
        ) : null}
        {content.blocks.map((b, i) => (
          <BlockView key={i} block={b} />
        ))}
        <View style={styles.links}>
          {others.map((id) => (
            <TextButton key={id} label={labels[id].read} onPress={() => router.setParams({ doc: labels[id].param })} />
          ))}
          <TextButton label={t('Open on the Web')} bold={false} color={c.muted} onPress={() => openUrl(here.url)} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function BlockView({ block }: { block: Block }) {
  const c = useTheme();
  if ('h' in block) {
    return (
      <AppText variant="headline" accessibilityRole="header" style={styles.heading}>
        {block.h}
      </AppText>
    );
  }
  if ('p' in block) return <AppText color={c.text} style={styles.para}>{block.p}</AppText>;
  return (
    <View style={styles.list}>
      {block.list.map((item) => {
        // Items that open with a short label ("Billing. ...") show the label in bold.
        const m = item.match(/^([A-Z][^.]{2,40}\.)\s(.*)$/s);
        return (
          <View key={item} style={styles.item}>
            <View style={[styles.bullet, { backgroundColor: c.primary }]} />
            <AppText color={c.text} style={[styles.flex, styles.para]}>
              {m ? (
                <>
                  <AppText weight="600" color={c.text}>{m[1]}</AppText>
                  {` ${m[2]}`}
                </>
              ) : (
                item
              )}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 8 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 40, gap: 12 },
  heading: { marginTop: 12 },
  para: { fontSize: 16, lineHeight: 23 },
  list: { gap: 10 },
  item: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 3, marginTop: 9 },
  links: { marginTop: 16, alignItems: 'flex-start', gap: 4 },
});
