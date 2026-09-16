import * as SecureStore from 'expo-secure-store';

/**
 * Keychain (iOS) / Keystore (Android) wrapper for anything that must not land
 * in plaintext: API session tokens, and — if the app ever holds keys itself —
 * the encrypted wallet blob.
 *
 * `WHEN_UNLOCKED_THIS_DEVICE_ONLY` keeps entries out of iCloud Keychain backups,
 * so a restored backup on another device cannot carry the wallet with it.
 */
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const secure = {
  get(key: string): Promise<string | null> {
    return SecureStore.getItemAsync(key, OPTIONS);
  },

  set(key: string, value: string): Promise<void> {
    return SecureStore.setItemAsync(key, value, OPTIONS);
  },

  remove(key: string): Promise<void> {
    return SecureStore.deleteItemAsync(key, OPTIONS);
  },
};

export const SECURE_KEYS = {
  /** Backend session token. */
  session: 'alli.session',
  /**
   * Encrypted wallet blob. Nothing writes this yet — see the custody decision in
   * mobile/README.md before adding a signing path.
   */
  wallet: 'alli.wallet.v1',
} as const;
