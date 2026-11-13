import AsyncStorage from '@react-native-async-storage/async-storage';

// A random id kept on this phone only. It is not derived from the person, the phone's hardware, or the advertising id,
// and it is deleted with the app. It keeps an A/B variant steady and is used only for A/B variants (usage counts use PostHog's own random id).
const INSTALL_KEY = 'kavi.installId';
let installId: string | null = null;

export async function getInstallId(): Promise<string> {
  if (installId) return installId;
  try {
    installId = await AsyncStorage.getItem(INSTALL_KEY);
  } catch {}
  if (!installId) {
    installId = Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
    try {
      await AsyncStorage.setItem(INSTALL_KEY, installId);
    } catch {}
  }
  return installId;
}
