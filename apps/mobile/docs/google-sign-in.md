# Sign up and sign in with Google

One button does both. The first time someone taps "Continue with Google", Supabase creates their account; after that it
signs them in. If an account with the same verified email already exists (for example from email and password), Supabase
links the Google identity to it instead of making a second account.

## How it works in the app

1. The person ticks the Terms and Privacy box on the sign-in sheet (`src/app/auth.tsx`). Nothing is pre-ticked.
2. `api.signInWithProvider('google')` (`src/lib/api.ts`) tries the **native** flow first (`src/lib/nativeSignIn.ts`): Google's
   account picker gives back an ID token, and `supabase.auth.signInWithIdToken` turns it into a session.
3. If this build cannot do it natively (Expo Go, no client ID) **or** the Supabase project refuses native tokens (provider
   off, client ID not trusted, nonce setting), the app quietly uses the **browser** flow instead
   (`signInWithOAuth`, returning to `kelmi://auth-callback`). In development the console says which setting to change.
4. Closing the Google sheet is a cancel, not an error. Other failures show a translated message (no connection, a sign-in
   window already open, Google Play services missing). `src/lib/authErrors.ts` decides which is which; its tests run with
   `npm run test:auth`.
5. Sign out also clears the Google account (`signOutNative`), so the next sign-in offers the account picker.
6. Deleting the account removes it on the server, then revokes Kelmi's access to the person's Google account
   (`revokeNativeAccess`). Best effort: deletion never waits on it.

## One-time setup

**Google Cloud (APIs and Services > Credentials)**

- A **Web** OAuth client. Its ID is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`; its secret goes only into Supabase.
- An **iOS** OAuth client for the bundle ID `com.logicbaker.kelmi`. Its ID is `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`, and the
  reversed ID (`com.googleusercontent.apps.<id>`) is the `iosUrlScheme` in `app.json`.
- For Android, an **Android** OAuth client with the package name `com.logicbaker.kelmi` and the SHA-1 of each signing key
  (debug, EAS, and Play App Signing). Without it Android shows `DEVELOPER_ERROR`.
- Authorized redirect URI on the Web client: `https://<project-ref>.supabase.co/auth/v1/callback` (used by the browser flow).

**Supabase (Authentication > Sign In / Providers > Google)**

- Enable the provider; paste the Web client ID and secret.
- **Authorized Client IDs**: add the Web client ID and the iOS client ID, comma separated.
- Turn on **Skip nonce checks**. The native Google library cannot set a nonce, so Supabase would otherwise reject the
  token with "Passed nonce and nonce in id_token should either both exist or not." (Apple sign-in does not need this.)
- Authentication > URL Configuration > Redirect URLs: add `kelmi://auth-callback` (browser flow and email links).

**Builds**

- Put the two `EXPO_PUBLIC_GOOGLE_*` values in `.env` for local builds, and in the EAS project's environment variables for
  cloud builds.
- Changing `app.json` plugin settings (the URL scheme) needs a new native build, not just a reload.

## When it goes wrong

| What you see | Cause | Fix |
| --- | --- | --- |
| "Passed nonce and nonce in id_token…" (the app falls back to the browser) | Skip nonce checks is off | Turn it on in the Google provider |
| "Unacceptable audience in id_token" | Client ID not trusted | Add the Web and iOS client IDs to Authorized Client IDs |
| "provider is not enabled" | Google provider off | Enable it |
| Browser sheet says redirect not allowed | Redirect URL missing | Add `kelmi://auth-callback` |
| `DEVELOPER_ERROR` on Android | SHA-1 or package name does not match | Add the signing key's SHA-1 to the Android client |
| The Google button does nothing in Expo Go | No native module | Use a development build |

## Before release

- The Privacy Policy already names Apple and Google sign-in. If Kelmi starts collecting anything else from Google (for
  example profile photos), update it and the App Store and Play privacy forms in the same change.
- Sign in with Apple is offered alongside Google, as App Store rules require.
