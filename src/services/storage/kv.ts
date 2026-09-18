import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Non-sensitive persistence: cached balances, draft runs, UI preferences.
 * Never put keys, seed phrases or session tokens here — use `secure.ts`.
 */
export const kv = {
  async get<T>(key: string): Promise<T | null> {
    const raw = await AsyncStorage.getItem(key);
    if (raw === null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  },

  async remove(key: string): Promise<void> {
    await AsyncStorage.removeItem(key);
  },
};

export const KEYS = {
  runHistory: 'alli.run.history',
  /** The in-progress run, so closing the app mid-run does not lose it. */
  runDraft: 'alli.run.draft',
  /** Fixes the background location task collected while the app was away. */
  runBackgroundFixes: 'alli.run.bgfixes',
  garden: 'alli.garden.plots',
  /** Taps on each tree today, so closing the app mid-way keeps the count. */
  gardenTaps: 'alli.garden.taps',
  cart: 'alli.market.cart',
  walletAddress: 'alli.wallet.address',
  onboarded: 'alli.onboarded',
} as const;
