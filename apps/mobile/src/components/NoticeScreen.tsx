import type { ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useT } from '../i18n';
import { modalEdges } from '../navigation';
import { space, useTheme } from '../theme';
import { AppText } from './AppText';
import { IconButton } from './Buttons';
import { Mascot, type MascotPose } from './Mascot';

// A plain sheet for a notice the person has to read once: Pip, a title, the words, and the buttons pinned below. Used by
// the AI planning choice and the allergy notice.
export function NoticeScreen({
  pip,
  title,
  onClose,
  children,
  footer,
}: {
  pip: MascotPose;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer: ReactNode;
}) {
  const c = useTheme();
  const { t } = useT();
  return (
    <SafeAreaView edges={modalEdges} style={[styles.root, { backgroundColor: c.bg }]}>
      <View style={styles.top}>
        <IconButton icon="close" label={t('Close')} onPress={onClose} />
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        <Mascot pose={pip} size={104} decorative style={styles.pip} />
        <AppText variant="largeTitle" accessibilityRole="header">
          {title}
        </AppText>
        {children}
      </ScrollView>
      <View style={[styles.footer, { borderTopColor: c.line }]}>{footer}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  top: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 12, paddingTop: 8 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 14 },
  pip: { marginLeft: -10, marginBottom: -6 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 12, paddingBottom: 8, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
});
