import { Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold, useFonts } from '@expo-google-fonts/outfit';
import { router, Stack, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { Celebrations } from '../components/Lottie';
import { LanguageProvider } from '../i18n';
import { startAnalytics } from '../lib/analytics';
import { startAppearance } from '../lib/appearance';
import { getAgeStatus } from '../lib/consent';
import { AppStateProvider, useApp } from '../state/AppState';
import { useTheme } from '../theme';

SplashScreen.preventAutoHideAsync();
// Light unless the person chose otherwise in Settings. Runs before the first screen draws.
startAppearance();
startAnalytics();

// Kelmi is for people 13 and older. Sign-up and onboarding are only reachable once this phone has a passing answer on the age screen, so a
// deep link or a saved route can't skip it. Someone already signed in has been through it and edits their household freely.
function AgeGuard() {
  const segments = useSegments();
  const { signedIn, authReady } = useApp();
  const top = segments[0] as string | undefined;
  const guarded = top === 'auth' || top === 'onboarding';

  useEffect(() => {
    if (!guarded || !authReady || signedIn) return;
    let live = true;
    getAgeStatus().then((status) => {
      if (live && status !== 'ok') router.replace({ pathname: '/age', params: { next: '/onboarding/diet' } });
    });
    return () => {
      live = false;
    };
  }, [guarded, authReady, signedIn, segments.join('/')]);
  return null;
}

export default function RootLayout() {
  const c = useTheme();
  const [loaded, error] = useFonts({ Outfit_400Regular, Outfit_500Medium, Outfit_600SemiBold, Outfit_700Bold });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <LanguageProvider>
    <AppStateProvider>
      <StatusBar style="auto" />
      <AgeGuard />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="welcome" />
        <Stack.Screen name="age" />
        <Stack.Screen name="onboarding/diet" options={{ animation: 'none' }} />
        <Stack.Screen name="onboarding/household" options={{ animation: 'none' }} />
        <Stack.Screen name="onboarding/kitchen" options={{ animation: 'none' }} />
        <Stack.Screen name="onboarding/save" options={{ animation: 'none' }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="recipe/[id]" />
        <Stack.Screen name="swap/[slot]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="plan-groceries" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recipe-edit/[id]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="cook/[id]" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="plus" />
        <Stack.Screen name="auth" options={{ presentation: 'modal' }} />
        <Stack.Screen name="paywall" options={{ presentation: 'modal' }} />
        <Stack.Screen name="ai-consent" options={{ presentation: 'modal' }} />
        <Stack.Screen name="allergy-ack" options={{ presentation: 'modal' }} />
        <Stack.Screen name="acknowledgements" options={{ presentation: 'modal' }} />
        <Stack.Screen name="legal/[doc]" options={{ presentation: 'modal' }} />
        <Stack.Screen name="language" options={{ presentation: 'modal' }} />
        <Stack.Screen name="appearance" options={{ presentation: 'modal' }} />
      </Stack>
      <Celebrations />
    </AppStateProvider>
    </LanguageProvider>
  );
}
