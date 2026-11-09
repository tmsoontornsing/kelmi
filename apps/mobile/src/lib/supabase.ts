import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import './webcrypto';

// Only the anon key ships in the app. Row-level security protects the data, and the
// service_role key must never appear in client code.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

// Null until the env vars are set, so the app can keep running on mock data.
export const supabase = isSupabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        // Apple and Google sign-in return to the app with a one-time code that this client exchanges for a session.
        flowType: 'pkce',
      },
    })
  : null;

// Refresh the session only while the app is in the foreground, as Supabase recommends for React Native.
if (supabase) {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}
