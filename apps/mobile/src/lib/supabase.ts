import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

import './webcrypto';

// The app holds no Supabase key. It talks to the project's gateway function (supabase/functions/gateway), which adds the
// anon key on the server and forwards the request. Only the gateway's address is set here, and that is not a secret.
// Row-level security still decides what any request can read or write, and the service_role key must never appear in
// client code.
const gatewayUrl = process.env.EXPO_PUBLIC_GATEWAY_URL;

// supabase-js insists on a key. This stand-in is replaced by the real one at the gateway; on its own it opens nothing.
const GATEWAY_PLACEHOLDER = 'kelmi-gateway';

// The platform cuts a path short when `functions/v1` appears in it twice, and the gateway lives at `/functions/v1/gateway`,
// so supabase-js's `<gateway>/functions/v1/<name>` calls are sent as `<gateway>/fn/<name>`. The gateway maps them back.
const viaGateway: typeof fetch = (input, init) =>
  fetch(typeof input === 'string' ? input.replace('/gateway/functions/v1/', '/gateway/fn/') : input, init);

export const isSupabaseConfigured = Boolean(gatewayUrl);

// Null until the gateway address is set, so the app can keep running on mock data.
export const supabase = isSupabaseConfigured
  ? createClient(gatewayUrl!, GATEWAY_PLACEHOLDER, {
      global: { fetch: viaGateway },
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
