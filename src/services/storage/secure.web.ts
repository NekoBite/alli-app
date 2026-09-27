/**
 * Web has no keychain. The web build is a development preview (design review, screenshots), not a
 * shipped target, so the session lives in sessionStorage: gone when the tab closes, never shared
 * with another tab. Do not hold a wallet key here — `SECURE_KEYS.wallet` must stay native-only.
 */
const store = (): Storage | null => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
};

export const secure = {
  async get(key: string): Promise<string | null> {
    return store()?.getItem(key) ?? null;
  },

  async set(key: string, value: string): Promise<void> {
    if (key === SECURE_KEYS.wallet) throw new Error('The web preview does not hold wallet keys.');
    store()?.setItem(key, value);
  },

  async remove(key: string): Promise<void> {
    store()?.removeItem(key);
  },
};

export const SECURE_KEYS = {
  session: 'alli.session',
  wallet: 'alli.wallet.v1',
} as const;
