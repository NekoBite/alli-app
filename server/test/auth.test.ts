import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { pool } from '../src/db/pool.ts';
import { providerClient, setProviderClient, type ProviderProfile } from '../src/auth/providers.ts';
import { requestLoginCode, resolveSession, signInWithProvider, verifyLoginCode } from '../src/auth/service.ts';
import { createUser, setupDb } from './helpers.ts';

after(async () => pool.end());

function google(over: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    provider: 'google',
    providerUserId: 'g-123',
    email: 'Ada@Example.com',
    emailVerified: true,
    displayName: 'Ada',
    ...over,
  };
}

describe('sign-in with a provider', () => {
  beforeEach(setupDb);

  it('creates an account from a verified email and signs in again to the same one', async () => {
    const first = await signInWithProvider(google(), 'test-agent');
    assert.equal(first.user.email, 'ada@example.com');
    assert.equal(first.user.displayName, 'Ada');
    assert.ok(first.token.length > 20);

    const again = await signInWithProvider(google({ displayName: 'Ada L.' }));
    assert.equal(again.user.id, first.user.id, 'same account');
    assert.equal(again.user.displayName, 'Ada', 'the first display name sticks');
    assert.notEqual(again.token, first.token, 'a fresh session each time');

    const { rows } = await pool.query('SELECT count(*)::int AS n FROM identities');
    assert.equal(rows[0]!.n, 1);
  });

  it('links to an account that already signed in by email code', async () => {
    const userId = await createUser('ada@example.com');
    const session = await signInWithProvider(google());
    assert.equal(session.user.id, userId);
    assert.equal((await resolveSession(session.token))?.id, userId);
  });

  it('does not link on an unverified email, and X gets an account with no email', async () => {
    const userId = await createUser('ada@example.com');
    const unverified = await signInWithProvider(google({ emailVerified: false }));
    assert.notEqual(unverified.user.id, userId, 'a new account, not a takeover');
    assert.equal(unverified.user.email, null);

    const x = await signInWithProvider({
      provider: 'x',
      providerUserId: 'x-9',
      email: null,
      emailVerified: false,
      displayName: '@ada',
    });
    assert.equal(x.user.email, null);
    assert.equal(x.user.displayName, '@ada');
    assert.equal((await resolveSession(x.token))?.id, x.user.id);
  });

  it('keeps the two roads separate per provider id', async () => {
    const g = await signInWithProvider(google({ email: null, emailVerified: false }));
    const f = await signInWithProvider({
      provider: 'facebook',
      providerUserId: 'g-123',
      email: null,
      emailVerified: false,
      displayName: null,
    });
    assert.notEqual(g.user.id, f.user.id, 'same id at a different provider is a different person');
  });

  it('still issues email codes for an account with a nullable email column', async () => {
    await requestLoginCode('bob@example.com');
    const { rows } = await pool.query<{ id: string }>('SELECT id FROM auth_codes');
    assert.equal(rows.length, 1);
    await assert.rejects(() => verifyLoginCode('bob@example.com', '000000'), /not valid/);
  });

  it('refuses a provider that is not configured, and takes a stub for tests', async () => {
    assert.equal(providerClient().available('google'), false, 'no client id in the test env');
    await assert.rejects(
      () => providerClient().exchange({ provider: 'x', code: 'c', codeVerifier: 'v', redirectUri: 'alli://oauth/x' }),
      /not configured/,
    );
    setProviderClient({ available: () => true, exchange: async () => google() });
    const profile = await providerClient().exchange({ provider: 'google', code: 'c', codeVerifier: 'v', redirectUri: 'r' });
    assert.equal(profile.providerUserId, 'g-123');
  });
});
