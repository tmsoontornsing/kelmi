import { Redirect } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { Mascot, MASCOT_NAME, type MascotPose } from '../../components/Mascot';
import { MASCOT_POSES } from '../../components/mascotPoses.generated';
import { space, useTheme } from '../../theme';

// Development only: every Pip pose with its idle animation. Open exp://<host>:8081/--/dev/mascot.
export default function MascotGallery() {
  const c = useTheme();
  if (!__DEV__) return <Redirect href="/" />;
  const poses = Object.keys(MASCOT_POSES) as MascotPose[];
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <ScrollView contentContainerStyle={styles.content}>
        <AppText variant="largeTitle" accessibilityRole="header">{MASCOT_NAME}</AppText>
        <View style={styles.grid}>
          {poses.map((p) => (
            <View key={p} style={styles.cell}>
              <Mascot pose={p} size={150} />
              <AppText variant="headline">{MASCOT_POSES[p].label}</AppText>
              <AppText variant="footnote" style={styles.center}>{MASCOT_POSES[p].use}</AppText>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: space.gutter, paddingBottom: 40, gap: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 20 },
  cell: { width: '48%', alignItems: 'center', gap: 2 },
  center: { textAlign: 'center' },
});
