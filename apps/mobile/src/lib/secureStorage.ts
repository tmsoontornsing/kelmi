import AsyncStorage from '@react-native-async-storage/async-storage';
import * as aesjs from 'aes-js';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

// Where Supabase keeps the signed-in session. The session is too large for the Keychain/Keystore (about 2 KB per value),
// so each value is encrypted with AES-256 under its own random key: the key lives in SecureStore and only the ciphertext
// goes to AsyncStorage. Someone reading the app's files (a backup, a rooted phone) gets nothing usable without the key.
// The key is kept to this device, so a backup restored elsewhere starts signed out.
//
// Only for Supabase auth storage: every value it writes is JSON, which is how a mismatched key is noticed (see getItem).
// On the web, and anywhere SecureStore is missing, it falls back to plain AsyncStorage.

const KEY_OPTIONS: SecureStore.SecureStoreOptions = {
  // Readable once the phone has been unlocked after a restart, so a token refresh in the background still works.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

// SecureStore keys may only hold letters, digits, ".", "-" and "_".
const keyName = (key: string) => `kelmi.sk.${key.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const cipherName = (key: string) => `${key}.enc`;

let available: Promise<boolean> | null = null;
const secureAvailable = () =>
  (available ??= Platform.OS === 'web' ? Promise.resolve(false) : SecureStore.isAvailableAsync().catch(() => false));

function encrypt(value: string): { key: string; cipher: string } {
  const key = Crypto.getRandomBytes(32);
  const iv = Crypto.getRandomBytes(16);
  const ctr = new aesjs.ModeOfOperation.ctr(key, new aesjs.Counter(iv));
  const bytes = ctr.encrypt(aesjs.utils.utf8.toBytes(value));
  // The counter's starting block is not secret; it travels with the ciphertext.
  return { key: aesjs.utils.hex.fromBytes(key), cipher: aesjs.utils.hex.fromBytes(iv) + aesjs.utils.hex.fromBytes(bytes) };
}

function decrypt(keyHex: string, cipherHex: string): string {
  const iv = aesjs.utils.hex.toBytes(cipherHex.slice(0, 32));
  const bytes = aesjs.utils.hex.toBytes(cipherHex.slice(32));
  const ctr = new aesjs.ModeOfOperation.ctr(aesjs.utils.hex.toBytes(keyHex), new aesjs.Counter(iv));
  return aesjs.utils.utf8.fromBytes(ctr.decrypt(bytes));
}

// Writes and removals for one key run one after another, so a key from one write is never paired with another's ciphertext.
const queues = new Map<string, Promise<unknown>>();
function serial<T>(key: string, work: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(work);
  queues.set(key, run);
  return run;
}

// The ciphertext is stored as "<id>.<hex>" and its key under a name holding the same id, so a key can only ever be paired
// with the ciphertext it encrypted, even if the app dies between the two writes (the old pair stays readable).
const splitCipher = (stored: string | null) => {
  const dot = stored?.indexOf('.') ?? -1;
  return stored && dot > 0 ? { id: stored.slice(0, dot), cipher: stored.slice(dot + 1) } : null;
};

async function setEncrypted(key: string, value: string) {
  const previous = splitCipher(await AsyncStorage.getItem(cipherName(key)));
  const id = aesjs.utils.hex.fromBytes(Crypto.getRandomBytes(6));
  const { key: k, cipher } = encrypt(value);
  await SecureStore.setItemAsync(`${keyName(key)}.${id}`, k, KEY_OPTIONS);
  await AsyncStorage.setItem(cipherName(key), `${id}.${cipher}`);
  if (previous) await SecureStore.deleteItemAsync(`${keyName(key)}.${previous.id}`, KEY_OPTIONS).catch(() => {});
}

async function removeEncrypted(key: string) {
  const previous = splitCipher(await AsyncStorage.getItem(cipherName(key)));
  await Promise.all([
    previous ? SecureStore.deleteItemAsync(`${keyName(key)}.${previous.id}`, KEY_OPTIONS).catch(() => {}) : null,
    AsyncStorage.removeItem(cipherName(key)),
  ]);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    if (!(await secureAvailable())) return AsyncStorage.getItem(key);
    // Reads share the write queue, so a read never lands between a write's two steps.
    return serial(key, async () => {
      const stored = splitCipher(await AsyncStorage.getItem(cipherName(key)));
      if (stored) {
        let k: string | null;
        try {
          k = await SecureStore.getItemAsync(`${keyName(key)}.${stored.id}`, KEY_OPTIONS);
        } catch {
          // The Keychain/Keystore couldn't be read just now (a locked phone, a Keystore hiccup). Report no session for
          // this read but keep everything, so the next read can still restore it.
          return null;
        }
        if (k) {
          try {
            const value = decrypt(k, stored.cipher);
            JSON.parse(value);
            return value;
          } catch {
            // A key that doesn't match: the session can't be read, so start signed out.
          }
        }
        // No key (a restore onto a new phone) or the wrong one: clear the unreadable copy.
        await removeEncrypted(key);
        return null;
      }

      // Sessions saved before this storage existed sit in AsyncStorage as plain text under the same key. Move one over
      // the first time it is read, so nobody is signed out by the update, and remove the plain copy.
      const legacy = await AsyncStorage.getItem(key);
      if (legacy === null) return null;
      try {
        await setEncrypted(key, legacy);
        await AsyncStorage.removeItem(key);
      } catch {
        // Keep the plain copy if the move fails; the next write tries again.
      }
      return legacy;
    });
  },

  async setItem(key: string, value: string): Promise<void> {
    if (!(await secureAvailable())) return AsyncStorage.setItem(key, value);
    await serial(key, async () => {
      await setEncrypted(key, value);
      // A leftover plain copy from before the move must not outlive the encrypted one.
      await AsyncStorage.removeItem(key);
    });
  },

  async removeItem(key: string): Promise<void> {
    if (!(await secureAvailable())) return AsyncStorage.removeItem(key);
    await serial(key, async () => {
      await removeEncrypted(key);
      await AsyncStorage.removeItem(key);
    });
  },
};
