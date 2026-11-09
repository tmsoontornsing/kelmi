import * as Crypto from 'expo-crypto';

// Hermes has no WebCrypto, so Supabase's sign-in code falls back to the "plain" PKCE challenge, which gives no protection
// if the sign-in redirect is intercepted. This supplies the two pieces it looks for: getRandomValues and subtle.digest,
// so it can use SHA-256. Import it before the Supabase client is created.
type Algorithm = string | { name: string };

const g = globalThis as unknown as { crypto?: Record<string, unknown> };
const webcrypto = (g.crypto ??= {});

if (typeof webcrypto.getRandomValues !== 'function') {
  webcrypto.getRandomValues = Crypto.getRandomValues;
}

if (!webcrypto.subtle) {
  webcrypto.subtle = {
    digest: (algorithm: Algorithm, data: BufferSource) =>
      Crypto.digest((typeof algorithm === 'string' ? algorithm : algorithm.name) as Crypto.CryptoDigestAlgorithm, data),
  };
}
