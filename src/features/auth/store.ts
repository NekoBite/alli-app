import { create } from 'zustand';

import { isMock } from '@/config/env';
import { ApiError, authApi, type AuthUser, type OAuthCode } from '@/services/api';
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
};

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  busy: false,

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
      set({ busy: false, status: 'signedIn', user: session.user, pendingEmail: undefined });
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
      set({ busy: false, status: 'signedIn', user: session.user, pendingEmail: undefined });
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
    set({ status: 'signedOut', user: undefined, pendingEmail: undefined, error: undefined });
  },

  cancelCode() {
    set({ pendingEmail: undefined, error: undefined });
  },
}));
