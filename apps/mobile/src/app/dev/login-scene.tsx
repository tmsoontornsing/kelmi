import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '../../components/AppText';
import { LivelyPip, LoginBackdrop } from '../../components/LoginScene';
import { space, useTheme } from '../../theme';

// Development only: the log-in page's moving background and Pip, without needing to be signed out.
// Open kelmi://dev/login-scene.
export default function LoginSceneDemo() {
  const c = useTheme();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <SafeAreaView style={[styles.root, { backgroundColor: c.bg }]}>
      <LoginBackdrop />
      <View style={styles.content}>
        <AppText variant="eyebrow" color={c.primaryText}>Welcome back</AppText>
        <AppText variant="largeTitle">Log In</AppText>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.line }]}>
          <LivelyPip size={110} />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { flex: 1, paddingHorizontal: space.gutter, paddingTop: 24, gap: 10 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 16, padding: 16, marginTop: 12 },
});
