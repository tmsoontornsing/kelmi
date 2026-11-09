import { Linking, Platform } from 'react-native';

// "Stores near me" hands off to the phone's own maps app with a search already typed in. Kelmi never asks for or reads the
// person's location, and no map or places service is called from here, so there is nothing to store or disclose beyond this link.
const QUERY = 'grocery store';

export const storeSearchUrl = () =>
  Platform.OS === 'android' ? `geo:0,0?q=${encodeURIComponent(QUERY)}` : `https://maps.apple.com/?q=${encodeURIComponent(QUERY)}`;

// Resolves true when a maps app opened.
export async function openStoreSearch(): Promise<boolean> {
  try {
    await Linking.openURL(storeSearchUrl());
    return true;
  } catch {
    return false;
  }
}
