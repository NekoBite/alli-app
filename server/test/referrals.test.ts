import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { Wallet, parseUnits } from 'ethers';

const quoteKey = Wallet.createRandom();
process.env.PAYMENT_ROUTER_ADDRESS = '0x000000000000000000000000000000000000a11e';
process.env.QUOTE_SIGNER_PRIVATE_KEY = quoteKey.privateKey;
process.env.USDT_TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
process.env.ALLI_TOKEN_ADDRESS = '0x00000000000000000000000000000000000a1111';

const { pool } = await import('../src/db/pool.ts');
const { attribute, codeFor, downline, hub, programDetail } = await import('../src/referrals/service.ts');
const { confirmPayment, createIntent } = await import('../src/payments/service.ts');
const { createOrder } = await import('../src/market/service.ts');
const { createUser, setupDb } = await import('./helpers.ts');

after(async () => pool.end());

const USDT = 10n ** 18n;
const WALLET = '0x7a3f9c21b4e8d05f6c1a8b2d3e4f5a6b7c8d9e01';

async function person(email: string, tier: 'leather' | 'silver' | 'gold' = 'leather', member = false): Promise<string> {
  const id = await createUser(email, 0);
  await pool.query('UPDATE users SET shoe_tier = $2, wallet_address = $3 WHERE id = $1', [id, tier, WALLET]);
  if (member) await pool.query(`INSERT INTO memberships (user_id, active_until) VALUES ($1, now() + interval '10 days')`, [id]);
  return id;
}

async function join(userId: string, sponsorId: string, program: 'run' | 'garden' | 'market' | 'card' = 'run') {
  return attribute(userId, await codeFor(pool, sponsorId, program));
}

async function commissionsOf(intentId: string) {
  const { rows } = await pool.query<{ generation: number; beneficiary_id: string | null; amount: string; rolled_up_from: string | null }>(
    'SELECT generation, beneficiary_id, amount::text, rolled_up_from FROM commissions WHERE intent_id = $1 ORDER BY generation',
    [intentId],
  );
  return rows;
}

describe('referral programs', () => {
  beforeEach(setupDb);

  it('attributes once per program: first join wins, no self-referral, no cycles', async () => {
    const a = await person('a@x.io');
    const b = await person('b@x.io');
    const c = await person('c@x.io');
    assert.deepEqual(await join(b, a), { program: 'run' });
    await join(b, c); // a later link does not move b
    const { rows } = await pool.query('SELECT sponsor_id FROM sponsorships WHERE user_id = $1 AND program = $2', [b, 'run']);
    assert.equal(rows[0].sponsor_id, a);
    await assert.rejects(join(a, a), /own invite/);
    await assert.rejects(join(a, b), /above yourself/);
    // Programs are separate: b can have a different Garden sponsor.
    await join(b, c, 'garden');
    const { rows: g } = await pool.query('SELECT sponsor_id FROM sponsorships WHERE user_id = $1 AND program = $2', [b, 'garden']);
    assert.equal(g[0].sponsor_id, c);
  });

  it('books the worked example from docs/referral-programs.md on a first Silver upgrade', async () => {
    // G5 Gold active ← G4 Silver lapsed ← G3 Silver active ← G2 Leather ← G1 Silver active ← buyer
    const g5 = await person('g5@x.io', 'gold', true);
    const g4 = await person('g4@x.io', 'silver', false);
    const g3 = await person('g3@x.io', 'silver', true);
    const g2 = await person('g2@x.io', 'leather', true);
    const g1 = await person('g1@x.io', 'silver', true);
    const buyer = await person('buyer@x.io');
    await join(g4, g5);
    await join(g3, g4);
    await join(g2, g3);
    await join(g1, g2);
    await join(buyer, g1);

    const intent = await createIntent(buyer, { kind: 'shoe', tier: 'silver', currency: 'USDT' });
    assert.equal(intent.amount, parseUnits('100', 18).toString());
    await confirmPayment({ id: intent.id, payer: intent.payer, token: intent.token, amount: BigInt(intent.amount), txHash: '0x1' });

    const rows = await commissionsOf(intent.id);
    const to = (id: string) => rows.filter((r) => r.beneficiary_id === id).reduce((s, r) => s + BigInt(r.amount), 0n);
    assert.equal(to(g1), 40n * USDT);
    assert.equal(to(g2), 0n);
    assert.equal(to(g3), 20n * USDT); // own 10 + g2's rolled up
    assert.equal(to(g5), 10n * USDT); // g4's rolled up
    assert.equal(rows.find((r) => r.generation === 2)?.rolled_up_from, g2);
    const { rows: tier } = await pool.query('SELECT shoe_tier FROM users WHERE id = $1', [buyer]);
    assert.equal(tier[0].shoe_tier, 'silver');

    // Silver → Gold is not a first Silver upgrade: no commission.
    const gold = await createIntent(buyer, { kind: 'shoe', tier: 'gold', currency: 'USDT' });
    await confirmPayment({ id: gold.id, payer: gold.payer, token: gold.token, amount: BigInt(gold.amount), txHash: '0x2' });
    assert.equal((await commissionsOf(gold.id)).length, 0);
  });

  it('sends an unqualified Gen 1 share to the treasury', async () => {
    const g1 = await person('g1@x.io', 'leather', true);
    const buyer = await person('buyer@x.io');
    await join(buyer, g1);
    const intent = await createIntent(buyer, { kind: 'shoe', tier: 'silver', currency: 'USDT' });
    await confirmPayment({ id: intent.id, payer: intent.payer, token: intent.token, amount: BigInt(intent.amount), txHash: '0x3' });
    const rows = await commissionsOf(intent.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.beneficiary_id, null);
    assert.equal(BigInt(rows[0]!.amount), 40n * USDT);
  });

  it('holds market commission until the return window closes, and shows it in the hub', async () => {
    const sponsor = await person('s@x.io');
    const buyer = await person('b@x.io');
    await join(buyer, sponsor, 'market');
    const order = await createOrder(buyer, {
      lines: [{ productId: 'prod-bottle-01', quantity: 1 }],
      method: 'USDT',
      address: { fullName: 'B', line1: '1', city: 'BKK', postcode: '1', country: 'TH', phone: '0000' },
    });
    const intent = await createIntent(buyer, { kind: 'order', orderId: order.id });
    await confirmPayment({ id: intent.id, payer: intent.payer, token: intent.token, amount: BigInt(intent.amount), txHash: '0x4' });

    const h = await hub(sponsor);
    const market = h.programs.find((p) => p.program === 'market')!;
    // 1% of (34 + 2.5 shipping) USDT.
    assert.equal(market.earned.usdt, 0.36);
    assert.equal(market.teamSize, 1);
    assert.equal(h.paidOutUsdt, 0); // still inside the return window
    assert.equal(h.programs.find((p) => p.program === 'card')!.status, 'comingSoon');
  });

  it('reports program detail and a masked downline', async () => {
    const me = await person('me@x.io', 'silver', true);
    const a = await person('jessica@gmail.com', 'silver', true);
    const b = await person('paul@hotmail.com', 'leather');
    await join(a, me);
    await join(b, a);
    const detail = await programDetail(me, 'run');
    assert.equal(detail.status, 'earning');
    assert.deepEqual(detail.teamByGeneration, [1, 1, 0, 0]);
    assert.equal(detail.milestone?.progress, 1);
    const tree = await downline(me, 'run');
    assert.equal(tree.total, 2);
    assert.equal(tree.members[0]!.handle, 'je*****@gmail.com');
    assert.equal(tree.members[1]!.sponsorId, a);
    assert.equal(tree.members[1]!.qualified, false);
    assert.match(detail.code, /^RUN-[2-9A-HJKMNP-Z]{6}$/);
  });
});
