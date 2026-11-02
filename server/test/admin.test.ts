import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import type { FastifyInstance } from 'fastify';

import { ROLE_PERMISSIONS, can } from '../src/admin/permissions.ts';
import { buildApp } from '../src/app.ts';
import { signInWithProvider } from '../src/auth/service.ts';
import { pool } from '../src/db/pool.ts';
import { quote as quoteShoe } from '../src/payments/service.ts';
import { ratesAt } from '../src/referrals/rates.ts';
import { createUser, setupDb } from './helpers.ts';

let app: FastifyInstance;
before(async () => {
  app = await buildApp();
});
after(async () => {
  await app.close();
  await pool.end();
});

type Role = 'super' | 'admin' | 'readonly' | null;
const heads: Record<string, Record<string, string>> = {};

async function signIn(name: string, role: Role) {
  const s = await signInWithProvider({ provider: 'google', providerUserId: name, email: `${name}@x.io`, emailVerified: true, displayName: name });
  if (role) await pool.query('UPDATE users SET admin_role = $2 WHERE id = $1', [s.user.id, role]);
  heads[name] = { authorization: `Bearer ${s.token}` };
  return s.user.id;
}

describe('admin back office', () => {
  let target: string;
  beforeEach(async () => {
    await setupDb();
    for (const k of Object.keys(heads)) delete heads[k];
    await signIn('boss', 'super');
    await signIn('mod', 'admin');
    await signIn('viewer', 'readonly');
    await signIn('plain', null);
    target = await createUser('target@example.com', 5);
  });

  const call = (who: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH', url: string, payload?: object) =>
    app.inject({ method, url, headers: heads[who], payload });

  // One request per permission, so a role's reach is checked against the real routes.
  const actions = (): [string, string, 'GET' | 'POST' | 'PUT' | 'PATCH', string, object | undefined][] => [
    ['view', 'list users', 'GET', '/v1/admin/users', undefined],
    ['edit_profile', 'rename', 'PATCH', `/v1/admin/users/${target}`, { displayName: 'New Name' }],
    ['send_signin', 'send sign-in', 'POST', `/v1/admin/users/${target}/send-signin`, {}],
    ['manage_accounts', 'create account', 'POST', '/v1/admin/users', { email: 'new@example.com' }],
    ['manage_accounts', 'set role', 'PUT', `/v1/admin/users/${target}/role`, { role: 'readonly' }],
    ['adjust_balances', 'adjust stars', 'POST', `/v1/admin/users/${target}/adjust-stars`, { sparkles: 100, reason: 'goodwill' }],
    ['adjust_balances', 'adjust rounds', 'POST', `/v1/admin/users/${target}/adjust-runs`, { rounds: 1, reason: 'goodwill' }],
    ['change_rates', 'change gold unlock', 'PUT', '/v1/admin/settings/gold-unlock', { required: 3, reason: 'client request' }],
    ['change_rates', 'change rates', 'PUT', '/v1/admin/rates/run', { ratesBps: [2500, 1000, 1000, 1000], reason: 'test change' }],
  ];

  it('allows exactly what the role matrix says, on every route, and nothing else', async () => {
    for (const who of ['boss', 'mod', 'viewer', 'plain'] as const) {
      const role = ({ boss: 'super', mod: 'admin', viewer: 'readonly', plain: null } as const)[who];
      for (const [perm, label, method, url, body] of actions()) {
        const res = await call(who, method, url, body);
        if (can(role, perm as never)) {
          assert.ok(res.statusCode < 300, `${who} should be allowed to ${label}: ${res.statusCode} ${res.body}`);
        } else {
          assert.equal(res.statusCode, 403, `${who} must not ${label}`);
        }
      }
    }
  });

  it('refuses everyone without a session', async () => {
    for (const [, label, method, url, body] of actions()) {
      assert.equal((await app.inject({ method, url, payload: body })).statusCode, 401, label);
    }
  });

  it('gives secondary admins profile edits and sign-in links, and read-only nothing', () => {
    assert.deepEqual([...ROLE_PERMISSIONS.admin].sort(), ['edit_profile', 'send_signin', 'view']);
    assert.deepEqual(ROLE_PERMISSIONS.readonly, ['view']);
  });

  it('takes a demotion effect on the very next request', async () => {
    assert.equal((await call('mod', 'PATCH', `/v1/admin/users/${target}`, { displayName: 'A' })).statusCode, 204);
    await pool.query(`UPDATE users SET admin_role = 'readonly' WHERE email = 'mod@x.io'`);
    assert.equal((await call('mod', 'PATCH', `/v1/admin/users/${target}`, { displayName: 'B' })).statusCode, 403);
  });

  it('renames a user and audits it', async () => {
    await call('mod', 'PATCH', `/v1/admin/users/${target}`, { displayName: 'Somchai' });
    const u = (await call('viewer', 'GET', `/v1/admin/users/${target}`)).json();
    assert.equal(u.displayName, 'Somchai');
    const log = (await call('viewer', 'GET', `/v1/admin/audit?target=${target}`)).json().entries;
    assert.equal(log[0].action, 'user.rename');
    assert.equal(log[0].actorEmail, 'mod@x.io');
  });

  describe('rates', () => {
    it('applies from now, never back in time, and leaves booked commissions alone', async () => {
      const before = Date.now();
      const res = await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [3000, 1000, 500, 500], reason: 'promo' });
      assert.equal(res.statusCode, 204);
      assert.deepEqual([...(await ratesAt(pool, 'run', Date.now()))], [3000, 1000, 500, 500]);
      assert.deepEqual([...(await ratesAt(pool, 'run', before - 1000))], [2000, 1000, 1000, 1000], 'the past is unchanged');
      const { rows } = await pool.query('SELECT effective_from FROM referral_rates WHERE program = $1 LIMIT 1', ['run']);
      assert.ok(rows[0].effective_from.getTime() >= before, 'effective_from comes from the server clock');
    });

    it('does not accept an effective date from the client', async () => {
      const res = await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [2000], reason: 'sneaky', effectiveFrom: 1 });
      assert.equal(res.statusCode, 400);
    });

    it('refuses rates that pay out more than 100%, and a missing reason', async () => {
      assert.equal((await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [6000, 6000], reason: 'too much' })).statusCode, 400);
      assert.equal((await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [2000], reason: '' })).statusCode, 400);
      assert.equal((await pool.query('SELECT 1 FROM referral_rates')).rowCount, 0);
    });

    it('refuses a change made against stale rates', async () => {
      await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [2500, 1000, 1000, 1000], reason: 'first' });
      const stale = await call('boss', 'PUT', '/v1/admin/rates/run', {
        ratesBps: [3000, 1000, 1000, 1000], reason: 'second', expectedCurrent: [2000, 1000, 1000, 1000],
      });
      assert.equal(stale.statusCode, 409);
      assert.equal(stale.json().code, 'rates_changed');
    });

    it('records who changed what, and why, in the audit log and the history', async () => {
      await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [2500, 1000, 1000, 1000], reason: 'client request' });
      const entry = (await call('viewer', 'GET', '/v1/admin/audit')).json().entries[0];
      assert.equal(entry.action, 'rates.change');
      assert.deepEqual(entry.detail.from, [2000, 1000, 1000, 1000]);
      assert.deepEqual(entry.detail.to, [2500, 1000, 1000, 1000]);
      const hist = (await call('viewer', 'GET', '/v1/admin/rates/run/history')).json().history;
      assert.equal(hist[0].setBy, 'boss@x.io');
      assert.equal(hist[0].note, 'client request');
    });

    it('writes nothing when the audit fails to commit with it (one transaction)', async () => {
      await pool.query('ALTER TABLE admin_audit RENAME TO admin_audit_x');
      try {
        const res = await call('boss', 'PUT', '/v1/admin/rates/run', { ratesBps: [2500], reason: 'will fail' });
        assert.equal(res.statusCode, 500);
        assert.equal((await pool.query('SELECT 1 FROM referral_rates')).rowCount, 0);
      } finally {
        await pool.query('ALTER TABLE admin_audit_x RENAME TO admin_audit');
      }
    });
  });

  describe('accounts and roles', () => {
    it('creates an account, refuses a duplicate email in any case', async () => {
      const ok = await call('boss', 'POST', '/v1/admin/users', { email: 'Fresh@Example.com', role: 'readonly' });
      assert.equal(ok.statusCode, 201);
      assert.equal((await call('boss', 'POST', '/v1/admin/users', { email: 'fresh@example.com' })).statusCode, 409);
    });

    it('never lets the last super admin be demoted or removed', async () => {
      const bossId = (await pool.query(`SELECT id FROM users WHERE email = 'boss@x.io'`)).rows[0].id;
      const res = await call('boss', 'PUT', `/v1/admin/users/${bossId}/role`, { role: null });
      assert.equal(res.statusCode, 409);
      assert.equal(res.json().code, 'last_super_admin');
      // With a second super admin, stepping down is fine.
      const other = await signIn('boss2', 'super');
      assert.equal((await call('boss', 'PUT', `/v1/admin/users/${bossId}/role`, { role: 'admin' })).statusCode, 204);
      assert.equal((await call('boss2', 'PUT', `/v1/admin/users/${other}/role`, { role: 'admin' })).statusCode, 409);
    });
  });

  describe('balances', () => {
    it('credits and debits stars and rounds through the ledgers, with an audit trail', async () => {
      const up = await call('boss', 'POST', `/v1/admin/users/${target}/adjust-stars`, { sparkles: 500, reason: 'goodwill gift' });
      assert.equal(up.json().sparkles, 500);
      const down = await call('boss', 'POST', `/v1/admin/users/${target}/adjust-stars`, { sparkles: -200, reason: 'correction' });
      assert.equal(down.json().sparkles, 300);
      const runs = await call('boss', 'POST', `/v1/admin/users/${target}/adjust-runs`, { rounds: 3, reason: 'compensation' });
      assert.equal(runs.json().runCredits, 8);
      const u = (await call('viewer', 'GET', `/v1/admin/users/${target}`)).json();
      assert.equal(u.sparkles, 300);
      assert.equal(u.runCredits, 8);
      const log = (await call('viewer', 'GET', `/v1/admin/audit?target=${target}`)).json().entries;
      assert.equal(log.length, 3);
      assert.equal(log[0].detail.reason, 'compensation');
    });

    it('refuses to go below zero, to move nothing, and to act without a reason', async () => {
      const post = (b: object) => call('boss', 'POST', `/v1/admin/users/${target}/adjust-stars`, b);
      assert.equal((await post({ sparkles: -1, reason: 'too much' })).statusCode, 409);
      assert.equal((await post({ sparkles: 0, reason: 'nothing' })).statusCode, 400);
      assert.equal((await post({ sparkles: 1.5, reason: 'fraction' })).statusCode, 400);
      assert.equal((await post({ sparkles: 10 })).statusCode, 400);
      const rounds = await call('boss', 'POST', `/v1/admin/users/${target}/adjust-runs`, { rounds: -6, reason: 'too many' });
      assert.equal(rounds.statusCode, 409);
    });
  });

  it('sends a secondary admin-triggered sign-in code to the user and audits it', async () => {
    const res = await call('mod', 'POST', `/v1/admin/users/${target}/send-signin`, {});
    assert.equal(res.statusCode, 204);
    assert.equal((await pool.query('SELECT 1 FROM auth_codes WHERE user_id = $1', [target])).rowCount, 1);
    const log = (await call('viewer', 'GET', `/v1/admin/audit?target=${target}`)).json().entries;
    assert.equal(log[0].action, 'user.send_signin');
  });

  describe('gold unlock', () => {
    const quote = async (who: string) => {
      const row = await pool.query(`SELECT id FROM users WHERE email = $1`, [`${who}@x.io`]);
      try {
        await quoteShoe(pool as never, row.rows[0].id, { kind: 'shoe', tier: 'gold', currency: 'USDT' }, Date.now());
        return { statusCode: 200, json: () => ({ code: '' }) };
      } catch (e) {
        const err = e as { status?: number; code?: string };
        return { statusCode: err.status ?? 500, json: () => ({ code: err.code }) };
      }
    };
    const silverDirect = async (sponsor: string, n: number) => {
      for (let i = 0; i < n; i++) {
        const id = await createUser(`d${i}-${sponsor.slice(0, 4)}@example.com`, 0);
        await pool.query(`UPDATE users SET shoe_tier = 'silver' WHERE id = $1`, [id]);
        await pool.query(`INSERT INTO sponsorships (program, user_id, sponsor_id) VALUES ('run', $1, $2)`, [id, sponsor]);
      }
    };

    it('needs 5 Silver directs by default, and the requirement can be changed by a super admin', async () => {
      const id = (await pool.query(`SELECT id FROM users WHERE email = 'plain@x.io'`)).rows[0].id;
      await silverDirect(id, 4);
      const locked = await quote('plain');
      assert.equal(locked.statusCode, 403);
      assert.equal(locked.json().code, 'gold_locked');

      assert.equal((await call('mod', 'PUT', '/v1/admin/settings/gold-unlock', { required: 4, reason: 'nope' })).statusCode, 403);
      assert.equal((await call('boss', 'PUT', '/v1/admin/settings/gold-unlock', { required: 4, reason: 'client request' })).statusCode, 204);
      assert.equal((await call('viewer', 'GET', '/v1/admin/settings')).json().goldUnlockSilverDirects, 4);
      assert.notEqual((await quote('plain')).statusCode, 403);
    });
  });
});
