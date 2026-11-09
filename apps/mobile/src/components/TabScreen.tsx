import type { ReactNode } from 'react';
import { Animated, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTabSlide, type TabName } from '../motion';
import { space, useTheme } from '../theme';
import { SaveNotice } from './SaveNotice';

// Shared shell for tab screens: a fixed header and scrolling content that clears the native tab bar.
// There is no pinned footer: the floating iOS tab bar would cover it, so totals live in the header.
// Content slides in from the side of the tab you came from; the background stays put.
export function TabScreen({ tab, header, children }: { tab: TabName; header: ReactNode; children: ReactNode }) {
  const c = useTheme();
  const slide = useTabSlide(tab);
  return (
    <SafeAreaView edges={['top']} style={[styles.root, { backgroundColor: c.bg }]}>
      <Animated.View style={[styles.flex, slide]}>
        <View style={styles.header}>{header}</View>
        <SaveNotice />
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          contentInsetAdjustmentBehavior="automatic"
          keyboardShouldPersistTaps="handled"
        >
          {children}
        </ScrollView>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 12, gap: 14 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 24, gap: 8 },
});
