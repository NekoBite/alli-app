import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';

import { getAddress } from 'ethers';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../src/app.ts';
import { signInWithProvider } from '../src/auth/service.ts';
import { pool } from '../src/db/pool.ts';
import { setupDb } from './helpers.ts';

let app: FastifyInstance;
before(async () => {
  app = await buildApp();
});
after(async () => {
  await app.close();
  await pool.end();
});

describe('commerce routes', () => {
  let auth: Record<string, string>;
  beforeEach(async () => {
    await setupDb();
    const session = await signInWithProvider({ provider: 'google', providerUserId: 'r-1', email: 'r@x.io', emailVerified: true, displayName: 'R' });
    auth = { authorization: `Bearer ${session.token}` };
  });

  it('requires a session', async () => {
    for (const url of ['/v1/run/entitlement', '/v1/referrals', '/v1/market/orders', '/v1/wallet/transactions']) {
      assert.equal((await app.inject({ url })).statusCode, 401, url);
    }
  });

  it('serves the catalogue, entitlement, referrals and prices', async () => {
    const products = await app.inject({ url: '/v1/market/products' });
    assert.equal(products.statusCode, 200);
    assert.ok(products.json().length > 3);

    const e = await app.inject({ url: '/v1/run/entitlement', headers: auth });
    assert.equal(e.json().runsLeft, 0);
    assert.equal(e.json().membership.status, 'none');

    const hub = await app.inject({ url: '/v1/referrals', headers: auth });
    assert.deepEqual(hub.json().programs.map((p: { program: string }) => p.program), ['run', 'garden', 'market', 'card']);

    const detail = await app.inject({ url: '/v1/referrals/garden', headers: auth });
    assert.match(detail.json().code, /^GRD-/);
    assert.equal((await app.inject({ url: '/v1/referrals/nope', headers: auth })).statusCode, 400);

    const prices = await app.inject({ url: '/v1/wallet/prices' });
    assert.equal(prices.json().USDT, 1);
  });

  it('answers 503 for purchases until the payment router is configured', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/payments/intents',
      headers: auth,
      payload: { kind: 'membership', currency: 'USDT' },
    });
    assert.equal(res.statusCode, 503);
    assert.equal(res.json().code, 'payments_unavailable');
  });

  it('validates orders and wallet addresses', async () => {
    const bad = await app.inject({ method: 'POST', url: '/v1/market/orders', headers: auth, payload: { lines: [], method: 'ALLI' } });
    assert.equal(bad.statusCode, 400);
    const typo = await app.inject({
      method: 'PUT',
      url: '/v1/auth/wallet',
      headers: auth,
      payload: { address: '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01' },
    });
    assert.equal(typo.statusCode, 400);
    const ok = await app.inject({
      method: 'PUT',
      url: '/v1/auth/wallet',
      headers: auth,
      payload: { address: '0x7a3f9c21b4e8d05f6c1a8b2d3e4f5a6b7c8d9e01' },
    });
    assert.equal(ok.json().walletAddress, getAddress('0x7a3f9c21b4e8d05f6c1a8b2d3e4f5a6b7c8d9e01'));
  });
});
