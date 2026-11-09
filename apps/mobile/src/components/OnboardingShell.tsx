import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Reveal } from '../motion';
import { space, useTheme } from '../theme';
import { AppText } from './AppText';
import { Mascot, type MascotPose } from './Mascot';
import { SaveNotice } from './SaveNotice';
import { StepHeader } from './StepHeader';

// Step header, scrolling body, and a footer pinned above the home indicator, or above the keyboard while typing.
export function OnboardingShell({
  step,
  backLabel,
  title,
  intro,
  pip = 'think',
  children,
  footer,
}: {
  step: 1 | 2 | 3 | 4;
  backLabel: string;
  title: string;
  intro: string;
  // Pip's pose for this question.
  pip?: MascotPose;
  children: ReactNode;
  footer: ReactNode;
}) {
  const c = useTheme();
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <StepHeader step={step} backLabel={backLabel} />
      <SaveNotice />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Reveal lift={0} style={styles.stack}>
            <View style={styles.introRow}>
              <View style={styles.intro}>
                <AppText variant="largeTitle" accessibilityRole="header">
                  {title}
                </AppText>
                <AppText color={c.muted}>{intro}</AppText>
              </View>
              <Mascot pose={pip} size={96} decorative tappable style={styles.pip} />
            </View>
            {children}
          </Reveal>
        </ScrollView>
        <View style={[styles.footer, { borderTopColor: c.line }]}>{footer}</View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.gutter, paddingTop: 8, paddingBottom: 16 },
  stack: { gap: 20 },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4 },
  intro: { flex: 1, gap: 6 },
  pip: { marginTop: 4, marginRight: -8 },
  footer: { paddingHorizontal: space.gutter, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
