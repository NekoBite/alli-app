import { randomBytes } from 'node:crypto';
import { getAddress, parseUnits } from 'ethers';

import { signQuote, requirePayments, type PaymentsConfig } from '../chain/signer.ts';
import { entitlement, grantPack, renewMembership } from '../credits/service.ts';
import { pool, transaction, type Db } from '../db/pool.ts';
import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';
import { bookCommission } from '../referrals/service.ts';
import { toSparkles } from '../shared/run.ts';
import { findSeed } from '../shared/garden.ts';
import {
  MARKET_RULES,
  MEMBERSHIP_PRICE_ALLI,
  PAYMENT_KIND,
  RUN_CREDIT_RULES,
  RUN_PACKS,
  SHOE_ORDER,
  SHOE_PRICE_USDT,
  extraRunsCost,
  remainingPurchasableRuns,
  type PaymentKind,
  type ShoeTier,
} from '../shared/commerce.ts';

export type IntentInput =
  | { kind: 'runs'; runs: number; currency: 'ALLI' | 'USDT' }
  | { kind: 'membership'; currency: 'ALLI' | 'USDT' }
  | { kind: 'seed'; seedId: string }
  | { kind: 'shoe'; tier: ShoeTier; currency: 'ALLI' | 'USDT' }
  | { kind: 'order'; orderId: string };

/** What the app receives: everything PaymentRouter.pay needs, plus display fields. */
export type IntentView = {
  id: string;
  kind: PaymentKind;
  payer: string;
  symbol: 'ALLI' | 'USDT';
  token: string;
  amount: string;
  formatted: string;
  router: string;
  deadline: number;
  signature: string;
};

type Quote = { symbol: 'ALLI' | 'USDT'; price: number; ref: Record<string, unknown> };

/** Prices a purchase from the shared rules. The app shows the same numbers; this one binds. */
async function quote(db: Db, userId: string, input: IntentInput, now: number): Promise<Quote> {
  switch (input.kind) {
    case 'runs': {
      const left = remainingPurchasableRuns((await entitlement(db, userId, now)).extraRunsBoughtThisMonth);
      if (input.runs > left) throw ApiError.badRequest('run_cap', `You can buy ${left} more runs this month.`);
      if (input.currency === 'USDT') return { symbol: 'USDT', price: extraRunsCost(input.runs), ref: { runs: input.runs } };
      const pack = RUN_PACKS.find((p) => p.runs === input.runs);
      if (!pack) throw ApiError.badRequest('unknown_pack', 'In ALLI, runs are sold in packs of 5, 10 or 30.');
      return { symbol: 'ALLI', price: pack.alli, ref: { runs: input.runs } };
    }
    case 'membership':
      return input.currency === 'ALLI'
        ? { symbol: 'ALLI', price: MEMBERSHIP_PRICE_ALLI, ref: {} }
        : { symbol: 'USDT', price: RUN_CREDIT_RULES.membershipPriceUsdt, ref: {} };
    case 'seed': {
      const seed = findSeed(input.seedId);
      if (!seed) throw ApiError.badRequest('unknown_seed', 'That seed is not in the catalogue.');
      return { symbol: seed.currency, price: seed.price, ref: { seedId: seed.id } };
    }
    case 'shoe': {
      const { rows } = await db.query<{ shoe_tier: ShoeTier }>('SELECT shoe_tier FROM users WHERE id = $1', [userId]);
      const current = rows[0]?.shoe_tier ?? 'leather';
      const price = SHOE_PRICE_USDT[input.tier];
      if (!price || SHOE_ORDER.indexOf(input.tier) <= SHOE_ORDER.indexOf(current)) {
        throw ApiError.badRequest('bad_upgrade', 'That is not an upgrade from your current shoe.');
      }
      if (input.currency !== 'USDT') throw ApiError.badRequest('usdt_only', 'Shoe upgrades are sold in USDT.');
      return { symbol: 'USDT', price, ref: { tier: input.tier, from: current } };
    }
    case 'order': {
      const { rows } = await db.query<{ method: 'ALLI' | 'USDT'; total: string; status: string }>(
        'SELECT method, total, status FROM orders WHERE id = $1 AND user_id = $2',
        [input.orderId, userId],
      );
      const order = rows[0];
      if (!order) throw ApiError.notFound('order_not_found', 'Order not found.');
      if (order.status !== 'pending-payment') throw ApiError.conflict('order_not_payable', 'This order is not awaiting payment.');
      return { symbol: order.method, price: Number(order.total), ref: { orderId: input.orderId } };
    }
  }
}

function tokenFor(config: PaymentsConfig, symbol: 'ALLI' | 'USDT'): string {
  const token = symbol === 'ALLI' ? config.alli : config.usdt;
  if (!token) throw ApiError.unavailable('payments_unavailable', `${symbol} payments are not configured on this server.`);
  return token;
}

/** Quotes and signs a purchase for the signed-in member's wallet. */
export async function createIntent(userId: string, input: IntentInput, now = Date.now()): Promise<IntentView> {
  const config = requirePayments();
  return transaction(async (db) => {
    const { rows } = await db.query<{ wallet_address: string | null }>(
      'SELECT wallet_address FROM users WHERE id = $1 FOR UPDATE',
      [userId],
    );
    const wallet = rows[0]?.wallet_address;
    if (!wallet) throw ApiError.conflict('wallet_required', 'Set up your wallet before paying.');

    const q = await quote(db, userId, input, now);
    const token = tokenFor(config, q.symbol);
    // 6 decimals of precision is plenty for a price; the token itself has 18.
    const amount = parseUnits(q.price.toFixed(6), 18);
    const id = `0x${randomBytes(32).toString('hex')}`;
    const deadline = Math.floor(now / 1000) + env.QUOTE_TTL_SECONDS;
    // Lowercased first: a stored address with a bad mixed-case checksum is still the same account.
    const payer = getAddress(wallet.toLowerCase());
    const signature = await signQuote(config, { id, payer, token, amount, kind: PAYMENT_KIND[input.kind], deadline });

    await db.query(
      `INSERT INTO payment_intents (id, user_id, kind, symbol, token, payer, amount, ref, deadline, signature)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9), $10)`,
      [id, userId, input.kind, q.symbol, token, payer, amount.toString(), JSON.stringify(q.ref), deadline, signature],
    );
    return {
      id,
      kind: input.kind,
      payer,
      symbol: q.symbol,
      token,
      amount: amount.toString(),
      formatted: q.price.toString(),
      router: config.router,
      deadline,
      signature,
    };
  });
}

export async function getIntent(userId: string, id: string, now = Date.now()) {
  const { rows } = await pool.query<{ status: string; tx_hash: string | null; deadline: Date }>(
    'SELECT status, tx_hash, deadline FROM payment_intents WHERE id = $1 AND user_id = $2',
    [id.toLowerCase(), userId],
  );
  const row = rows[0];
  if (!row) throw ApiError.notFound('intent_not_found', 'Payment not found.');
  // A pending quote past its deadline can no longer clear the contract; say so.
  const status = row.status === 'pending' && row.deadline.getTime() < now ? 'expired' : row.status;
  return { id, status, txHash: row.tx_hash ?? undefined };
}

/** A `Paid` event, as the chain watcher (or a test) reports it. */
export type PaidEvent = { id: string; payer: string; token: string; amount: bigint; txHash: string };

type IntentRow = {
  id: string;
  user_id: string;
  kind: PaymentKind;
  symbol: 'ALLI' | 'USDT';
  token: string;
  payer: string;
  amount: string;
  ref: Record<string, string | number>;
  status: string;
};

/**
 * Marks an intent paid and fulfils it, once. Everything the purchase grants happens here, in one
 * transaction with the status change, so a crash cannot leave a payment confirmed but unfulfilled.
 * An event that does not match the quote (payer, token, amount) marks the intent failed and grants
 * nothing — the contract makes that impossible, so seeing it means something upstream is wrong.
 */
export async function confirmPayment(event: PaidEvent, now = Date.now()): Promise<'fulfilled' | 'duplicate' | 'unknown' | 'mismatch'> {
  return transaction(async (db) => {
    const { rows } = await db.query<IntentRow>('SELECT * FROM payment_intents WHERE id = $1 FOR UPDATE', [event.id.toLowerCase()]);
    const intent = rows[0];
    if (!intent) return 'unknown';
    if (intent.status === 'confirmed') return 'duplicate';

    const matches =
      intent.payer.toLowerCase() === event.payer.toLowerCase() &&
      intent.token.toLowerCase() === event.token.toLowerCase() &&
      BigInt(intent.amount) === event.amount;
    if (!matches) {
      await db.query(`UPDATE payment_intents SET status = 'failed', tx_hash = $2 WHERE id = $1`, [intent.id, event.txHash]);
      return 'mismatch';
    }

    await db.query(
      `UPDATE payment_intents SET status = 'confirmed', tx_hash = $2, confirmed_at = to_timestamp($3/1000.0) WHERE id = $1`,
      [intent.id, event.txHash, now],
    );
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [intent.user_id]);
    await fulfil(db, intent, event, now);
    return 'fulfilled';
  });
}

async function fulfil(db: Db, intent: IntentRow, event: PaidEvent, now: number): Promise<void> {
  const amount = BigInt(intent.amount);
  switch (intent.kind) {
    case 'runs':
      await grantPack(db, intent.user_id, Number(intent.ref.runs), intent.id, now);
      return;
    case 'membership':
      await renewMembership(db, intent.user_id, intent.id, now);
      return;
    case 'seed':
      // The tree is planted by POST /v1/garden/plots with this intent, which consumes it.
      await bookCommission(db, { program: 'garden', buyerId: intent.user_id, symbol: intent.symbol, amount, intentId: intent.id, now });
      return;
    case 'shoe': {
      const tier = String(intent.ref.tier) as ShoeTier;
      await db.query('UPDATE users SET shoe_tier = $2 WHERE id = $1', [intent.user_id, tier]);
      // The ALLI RUN program pays on a member's *first* Silver upgrade only (docs §2).
      if (intent.ref.from === 'leather') {
        await bookCommission(db, { program: 'run', buyerId: intent.user_id, symbol: 'USDT', amount, intentId: intent.id, now });
      }
      return;
    }
    case 'order': {
      const orderId = String(intent.ref.orderId);
      const { rows } = await db.query<{ stars_back: string }>(
        `UPDATE orders SET status = 'paid', tx_hash = $2, paid_at = to_timestamp($3/1000.0)
          WHERE id = $1 AND status = 'pending-payment' RETURNING stars_back`,
        [orderId, event.txHash, now],
      );
      const starsBack = Number(rows[0]?.stars_back ?? 0);
      if (starsBack > 0) {
        await db.query(
          `INSERT INTO star_ledger (user_id, delta, reason, day, note) VALUES ($1, $2, 'order', to_timestamp($3/1000.0)::date, $4)`,
          [intent.user_id, toSparkles(starsBack), now, `Stars back · order ${orderId}`],
        );
      }
      // Market commission is held until the return window closes.
      await bookCommission(db, {
        program: 'market',
        buyerId: intent.user_id,
        symbol: intent.symbol,
        amount,
        intentId: intent.id,
        payableAt: now + MARKET_RULES.returnWindowDays * 86_400_000,
        now,
      });
      return;
    }
  }
}

/** Spends a confirmed seed intent on one planting. Throws unless it is paid, for this seed, and unused. */
export async function consumeSeedIntent(db: Db, userId: string, intentId: string, seedId: string): Promise<void> {
  const { rows } = await db.query<{ ref: { seedId?: string }; status: string; consumed_at: Date | null }>(
    `SELECT ref, status, consumed_at FROM payment_intents WHERE id = $1 AND user_id = $2 AND kind = 'seed' FOR UPDATE`,
    [intentId.toLowerCase(), userId],
  );
  const row = rows[0];
  if (!row || row.ref.seedId !== seedId) throw ApiError.badRequest('bad_payment', 'That payment is not for this seed.');
  if (row.status !== 'confirmed') throw new ApiError(402, 'payment_pending', 'The payment has not confirmed yet.');
  if (row.consumed_at) throw ApiError.conflict('payment_used', 'That payment already planted a tree.');
  await db.query('UPDATE payment_intents SET consumed_at = now() WHERE id = $1', [intentId.toLowerCase()]);
}

/** Whether purchases are open. When they are not, planting stays free (the pre-payments behaviour). */
export { paymentsConfig } from '../chain/signer.ts';
