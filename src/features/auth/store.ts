import { create } from 'zustand';

import { isMock } from '@/config/env';
import { ApiError, authApi, referralApi, type AuthUser, type OAuthCode } from '@/services/api';
import { secure, SECURE_KEYS } from '@/services/storage/secure';

/**
 * `unknown` until the stored session has been looked at, so the router does
 * not bounce a signed-in user through the sign-in screen on every launch.
 */
export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

type AuthState = {
  status: AuthStatus;
  user?: AuthUser;
  /** The address a code was sent to, while the code screen is up. */
  pendingEmail?: string;
  /**
   * True straight after the sign-in that created the account, until the wallet-ready screen
   * (1.3) is dismissed. Never restored from storage: a relaunch goes to Today.
   */
  isNewAccount: boolean;
  /**
   * An invite code from an `alli.app/r/<code>` link, held until the member is signed in and then
   * sent to the server once, which binds them to that sponsor in that code's program only.
   */
  referralCode?: string;
  busy: boolean;
  error?: string;

  /** Reads the stored session. Called once at launch. */
  restore: () => Promise<void>;
  requestCode: (email: string) => Promise<void>;
  verifyCode: (code: string) => Promise<void>;
  signInWithProvider: (input: OAuthCode) => Promise<void>;
  signOut: () => Promise<void>;
  /** Back from the code screen to the email screen. */
  cancelCode: () => void;
  /** Leaves the wallet-ready screen for Today. */
  finishOnboarding: () => void;
  /** Remembers an invite code; attributed straight away if already signed in. */
  setReferralCode: (code: string) => void;
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  busy: false,
  isNewAccount: false,

  async restore() {
    let token: string | null = null;
    try {
      token = await secure.get(SECURE_KEYS.session);
    } catch {
      token = null;
    }
    if (!token) {
      set({ status: 'signedOut' });
      return;
    }
    // A token is enough to let the user in; the profile is refreshed on the
    // side. Only a definite rejection from the server signs them out — a
    // dead network on launch must not.
    set({ status: 'signedIn' });
    try {
      set({ user: await authApi.me() });
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await secure.remove(SECURE_KEYS.session).catch(() => undefined);
        set({ status: 'signedOut', user: undefined });
      }
    }
  },

  async requestCode(email) {
    const address = email.trim().toLowerCase();
    set({ busy: true, error: undefined });
    try {
      await authApi.requestCode(address);
      set({ busy: false, pendingEmail: address });
    } catch (error) {
      set({ busy: false, error: (error as Error).message });
      throw error;
    }
  },

  async verifyCode(code) {
    const email = get().pendingEmail;
    if (!email) throw new Error('Enter your email first.');
    set({ busy: true, error: undefined });
    try {
      const session = await authApi.verifyCode(email, code.trim());
      await secure.set(SECURE_KEYS.session, session.token);
      set({
        busy: false,
        status: 'signedIn',
        user: session.user,
        pendingEmail: undefined,
        isNewAccount: session.isNew === true,
      });
      void attributePending(get, set);
    } catch (error) {
      set({ busy: false, error: (error as Error).message });
      throw error;
    }
  },

  async signInWithProvider(input) {
    set({ busy: true, error: undefined });
    try {
      const session = await authApi.signInWithProvider(input);
      await secure.set(SECURE_KEYS.session, session.token);
      set({
        busy: false,
        status: 'signedIn',
        user: session.user,
        pendingEmail: undefined,
        isNewAccount: session.isNew === true,
      });
      void attributePending(get, set);
    } catch (error) {
      set({ busy: false, error: (error as Error).message });
      throw error;
    }
  },

  async signOut() {
    // Revoke server-side first, best effort: a token the server no longer
    // honours is the point, and a failed call must not keep the user in.
    if (!isMock) await authApi.logout().catch(() => undefined);
    else await authApi.logout();
    await secure.remove(SECURE_KEYS.session).catch(() => undefined);
    set({
      status: 'signedOut',
      user: undefined,
      pendingEmail: undefined,
      error: undefined,
      isNewAccount: false,
    });
  },

  cancelCode() {
    set({ pendingEmail: undefined, error: undefined });
  },

  finishOnboarding() {
    set({ isNewAccount: false });
  },

  setReferralCode(code) {
    set({ referralCode: code.trim().toUpperCase() });
    if (get().status === 'signedIn') void attributePending(get, set);
  },
}));

/**
 * Sends a held invite code, once. Best effort: attribution is a nice-to-have for the member and a
 * failure (bad code, already attributed in that program) must never block sign-in.
 */
async function attributePending(
  get: () => AuthState,
  set: (partial: Partial<AuthState>) => void,
): Promise<void> {
  const code = get().referralCode;
  if (!code) return;
  set({ referralCode: undefined });
  try {
    await referralApi.attribute(code);
  } catch {
    // Attribution happens at first join only; a later or invalid link does nothing.
  }
}
