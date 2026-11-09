import { router, type Href } from 'expo-router';
import { Linking, Platform, Share } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

// Clears the stack before switching, so Back (including Android's hardware button)
// can't return to onboarding after sign-in, or into the app after sign-out.
export function resetTo(href: Href) {
  if (router.canDismiss()) router.dismissAll();
  router.replace(href);
}

// Back when there's somewhere to go, otherwise a fallback (for example after a deep link).
export function backOr(href: Href) {
  if (router.canGoBack()) router.back();
  else router.replace(href);
}

// iOS presents modals as page sheets below the status bar; Android shows them full screen.
export const modalEdges: Edge[] = Platform.OS === 'ios' ? ['bottom'] : ['top', 'bottom'];

// Opens the system share sheet, which lists whatever apps the phone has: Messages, Notes, Mail, WhatsApp and so on.
export function share(message: string, title?: string) {
  Share.share({ message, title }).catch(() => {});
}

export function openUrl(url: string) {
  Linking.openURL(url).catch(() => {});
}
