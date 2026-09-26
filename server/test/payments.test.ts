import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';

import { Wallet, parseUnits, verifyTypedData } from 'ethers';

// Payments open only with a router and a quote key; each test file is its own process, so this
// suite can switch them on before any server module reads the environment.
const quoteKey = Wallet.createRandom();
process.env.PAYMENT_ROUTER_ADDRESS = '0x000000000000000000000000000000000000a11e';
process.env.QUOTE_SIGNER_PRIVATE_KEY = quoteKey.privateKey;
process.env.USDT_TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
process.env.ALLI_TOKEN_ADDRESS = '0x00000000000000000000000000000000000a1111';
process.env.CHAIN_ID = '97';

const { pool } = await import('../src/db/pool.ts');
const { entitlement } = await import('../src/credits/service.ts');
const { confirmPayment, createIntent, getIntent } = await import('../src/payments/service.ts');
const { plant } = await import('../src/garden/service.ts');
const { createOrder, getOrder } = await import('../src/market/service.ts');
const { submitRun } = await import('../src/run/service.ts');
const { PAYMENT_INTENT_TYPES, PAYMENT_ROUTER_DOMAIN, PAYMENT_KIND } = await import('../src/shared/commerce.ts');
const { starsBalance } = await import('../src/run/service.ts');
const { createUser, DAY, goodTrack, setupDb, stepSamples } = await import('./helpers.ts');

after(async () => pool.end());

const PAYER = '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01';

async function member(credits = 0): Promise<string> {
  const id = await createUser(undefined, credits);
  await pool.query('UPDATE users SET wallet_address = $2 WHERE id = $1', [id, PAYER]);
  return id;
}

/** What the watcher would report for an intent paid exactly as quoted. */
const paid = (i: { id: string; payer: string; token: string; amount: string }, txHash = `0x${'ab'.repeat(32)}`) => ({
  id: i.id,
  payer: i.payer,
  token: i.token,
  amount: BigInt(i.amount),
  txHash,
});

describe('payment intents', () => {
  beforeEach(setupDb);

  it('quotes a run pack at the server price and signs it for the router', async () => {
    const user = await member();
    const intent = await createIntent(user, { kind: 'runs', runs: 10, currency: 'ALLI' });
    assert.equal(intent.symbol, 'ALLI');
    assert.equal(intent.amount, parseUnits('90', 18).toString());
    const signer = verifyTypedData(
      { ...PAYMENT_ROUTER_DOMAIN, chainId: 97, verifyingContract: intent.router },
      PAYMENT_INTENT_TYPES,
      { id: intent.id, payer: intent.payer, token: intent.token, amount: intent.amount, kind: PAYMENT_KIND.runs, deadline: intent.deadline },
      intent.signature,
    );
    assert.equal(signer, quoteKey.address);
  });

  it('refuses to quote without a wallet, and prices ALLI runs only in packs', async () => {
    const noWallet = await createUser(undefined, 0);
    await assert.rejects(createIntent(noWallet, { kind: 'membership', currency: 'USDT' }), /wallet/i);
    const user = await member();
    await assert.rejects(createIntent(user, { kind: 'runs', runs: 7, currency: 'ALLI' }), /packs/);
    const usdt = await createIntent(user, { kind: 'runs', runs: 3, currency: 'USDT' });
    assert.equal(usdt.amount, parseUnits((3 * 25 / 30).toFixed(6), 18).toString());
  });

  it('grants the pack once on confirmation, however often the event is seen', async () => {
    const user = await member();
    const intent = await createIntent(user, { kind: 'runs', runs: 5, currency: 'ALLI' });
    assert.equal((await getIntent(user, intent.id)).status, 'pending');
    assert.equal(await confirmPayment(paid(intent)), 'fulfilled');
    assert.equal(await confirmPayment(paid(intent)), 'duplicate');
    const e = await entitlement(pool, user);
    assert.equal(e.runsLeft, 5);
    assert.equal(e.extraRunsBoughtThisMonth, 5);
    assert.equal((await getIntent(user, intent.id)).status, 'confirmed');
  });

  it('grants nothing for an event that does not match the quote', async () => {
    const user = await member();
    const intent = await createIntent(user, { kind: 'runs', runs: 5, currency: 'ALLI' });
    assert.equal(await confirmPayment({ ...paid(intent), amount: 1n }), 'mismatch');
    assert.equal((await entitlement(pool, user)).runsLeft, 0);
    assert.equal((await getIntent(user, intent.id)).status, 'failed');
  });

  it('renews membership from the current end, not from now', async () => {
    const user = await member();
    const now = Date.now();
    const a = await createIntent(user, { kind: 'membership', currency: 'USDT' }, now);
    await confirmPayment(paid(a), now);
    const b = await createIntent(user, { kind: 'membership', currency: 'ALLI' }, now);
    await confirmPayment(paid(b), now);
    const e = await entitlement(pool, user, now);
    assert.equal(e.membership.status, 'active');
    assert.equal(e.runsLeft, 60);
    const days = (e.membership.activeUntil! - now) / 86_400_000;
    assert.ok(Math.abs(days - 60) < 0.01, `expected ~60 days, got ${days}`);
  });

  it('lets a run spend a bought credit, once per run even when the upload is retried', async () => {
    const user = await member();
    const track = goodTrack(100);
    const upload = { clientRunId: randomUUID(), startedAt: 1_700_000_000_000, track, stepSamples: stepSamples(track, 50), day: DAY };
    await assert.rejects(submitRun(user, upload), (e: { status?: number }) => e.status === 402);
    const intent = await createIntent(user, { kind: 'runs', runs: 5, currency: 'ALLI' });
    await confirmPayment(paid(intent));
    await submitRun(user, upload);
    await submitRun(user, upload);
    const e = await entitlement(pool, user);
    assert.equal(e.runsLeft, 4);
    assert.equal(e.runsThisMonth, 1);
  });

  it('plants only against a confirmed payment for that seed, and only once', async () => {
    const user = await member();
    await assert.rejects(plant(user, 'seed-acacia'), (e: { status?: number }) => e.status === 402);
    const intent = await createIntent(user, { kind: 'seed', seedId: 'seed-acacia' });
    await assert.rejects(plant(user, 'seed-acacia', Date.now(), intent.id), /not confirmed/);
    await confirmPayment(paid(intent));
    await assert.rejects(plant(user, 'seed-neem', Date.now(), intent.id), /not for this seed/);
    const plot = await plant(user, 'seed-acacia', Date.now(), intent.id);
    assert.equal(plot.seedId, 'seed-acacia');
    await assert.rejects(plant(user, 'seed-acacia', Date.now(), intent.id), /already planted/);
  });

  it('prices an order from the catalogue, marks it paid and pays the stars back', async () => {
    const user = await member();
    const order = await createOrder(user, {
      lines: [{ productId: 'prod-tee-01', variantId: 'm', quantity: 2 }],
      method: 'ALLI',
      address: { fullName: 'A', line1: '1 Road', city: 'Bangkok', postcode: '10110', country: 'TH', phone: '+66 000' },
    });
    assert.equal(order.total, 2 * 2500 + 80);
    assert.equal(order.status, 'pending-payment');
    const intent = await createIntent(user, { kind: 'order', orderId: order.id });
    assert.equal(intent.amount, parseUnits('5080', 18).toString());
    await confirmPayment(paid(intent));
    const after = await getOrder(user, order.id);
    assert.equal(after.status, 'paid');
    assert.ok(after.txHash);
    // 10% of 5,000 ALLI at 1,000 ALLI a star.
    assert.equal(await starsBalance(pool, user), 0.5);
    await assert.rejects(createIntent(user, { kind: 'order', orderId: order.id }), /not awaiting payment/);
  });

  it('refuses orders the catalogue cannot fill', async () => {
    const user = await member();
    const address = { fullName: 'A', line1: '1 Road', city: 'Bangkok', postcode: '10110', country: 'TH', phone: '+66 000' };
    await assert.rejects(createOrder(user, { lines: [{ productId: 'prod-tee-01', quantity: 1 }], method: 'ALLI', address }), /Pick a size/);
    await assert.rejects(createOrder(user, { lines: [{ productId: 'prod-tee-01', variantId: 'xl', quantity: 1 }], method: 'ALLI', address }), /out of stock/);
    await assert.rejects(createOrder(user, { lines: [{ productId: 'nope', quantity: 1 }], method: 'ALLI', address }), /Unknown product/);
  });
});
