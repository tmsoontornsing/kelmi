import { Redirect } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Mascot } from '../components/Mascot';
import { useT } from '../i18n';
import { useApp } from '../state/AppState';
import { useTheme } from '../theme';

// Entry point: new people see onboarding, signed-in people go straight to their week.
export default function Index() {
  const c = useTheme();
  const { signedIn, authReady } = useApp();
  const { t } = useT();
  // Wait for a saved session to be restored before choosing, so signed-in people don't flash the welcome screen.
  // Pip waits with them, so the gap after the launch screen is not a blank page.
  if (!authReady) {
    return (
      <View style={[styles.wait, { backgroundColor: c.bg }]}>
        <Mascot pose="wave" size={140} label={t('Pip, Kelmi\'s jar, waving while Kelmi starts')} />
      </View>
    );
  }
  return <Redirect href={signedIn ? '/week' : '/welcome'} />;
}

const styles = StyleSheet.create({
  wait: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
