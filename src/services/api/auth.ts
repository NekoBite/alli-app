import { isMock } from '@/config/env';
import { delay, request } from './client';

export type OAuthProvider = 'google' | 'facebook' | 'x';

export type AuthUser = {
  id: string;
  /** Null for an account that only ever signed in with a provider that gives no email (X). */
  email: string | null;
  displayName: string | null;
  walletAddress: string | null;
  createdAt: string;
};

export type AuthSession = {
  token: string;
  expiresAt: string;
  user: AuthUser;
  /** True when this sign-in created the account: the app shows the wallet-ready screen once. */
  isNew?: boolean;
};

/** What the phone hands the server after a provider's consent screen. */
export type OAuthCode = {
  provider: OAuthProvider;
  code: string;
  codeVerifier: string;
  redirectUri: string;
};

/**
 * Sign-in. Two roads to one session: a six-digit code by email, or a
 * provider's consent screen. In both cases the server is the only party that
 * mints a session, and for a provider it is the server, holding the client
 * secret, that exchanges the authorization code. No provider token ever
 * touches the phone.
 */
export interface AuthApi {
  requestCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<AuthSession>;
  signInWithProvider(input: OAuthCode): Promise<AuthSession>;
  me(): Promise<AuthUser>;
  logout(): Promise<void>;
}

const live: AuthApi = {
  requestCode: (email) =>
    request('/v1/auth/request-code', { method: 'POST', body: { email }, anonymous: true }),
  verifyCode: (email, code) =>
    request('/v1/auth/verify-code', { method: 'POST', body: { email, code }, anonymous: true }),
  signInWithProvider: (input) =>
    request('/v1/auth/oauth', { method: 'POST', body: input, anonymous: true }),
  me: () => request('/v1/auth/me'),
  logout: () => request('/v1/auth/logout', { method: 'POST' }),
};

const HOUR = 3_600_000;

function mockSession(email: string | null, displayName: string | null): AuthSession {
  return {
    // Mock mode treats every sign-in as the first, so the onboarding screen can be reviewed.
    isNew: true,
    token: `mock-session-${Date.now().toString(36)}`,
    expiresAt: new Date(Date.now() + 30 * 24 * HOUR).toISOString(),
    user: {
      id: 'user-mock',
      email,
      displayName,
      walletAddress: null,
      createdAt: new Date(Date.now() - 40 * 24 * HOUR).toISOString(),
    },
  };
}

let mockUser: AuthUser = mockSession('demo@alli.app', 'Demo runner').user;

const mock: AuthApi = {
  requestCode: () => delay(undefined, 500),

  async verifyCode(email, code) {
    if (!/^\d{6}$/.test(code)) throw new Error('That code is not valid or has expired.');
    const session = mockSession(email.trim().toLowerCase(), null);
    mockUser = session.user;
    return delay(session, 600);
  },

  async signInWithProvider({ provider }) {
    const names = { google: 'Google', facebook: 'Facebook', x: 'X' } as const;
    const session = mockSession(
      provider === 'x' ? null : `${provider}-demo@alli.app`,
      `${names[provider]} demo`,
    );
    mockUser = session.user;
    return delay(session, 600);
  },

  me: () => delay({ ...mockUser }),
  logout: () => delay(undefined, 200),
};

export const authApi: AuthApi = isMock ? mock : live;
