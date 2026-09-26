import type { FastifyInstance } from 'fastify';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { env } from '../config/env.ts';
import { pool } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import { fromSparkles } from '../shared/run.ts';

/**
 * Wallet reads. Balances come from the chain on the phone; these are what the server knows:
 * which address is the member's, the activity it caused, and display prices.
 */
export async function walletRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/wallet/account', {
    preHandler: requireUser,
    handler: async (request) => {
      const user = currentUser(request);
      if (!user.walletAddress) throw ApiError.notFound('no_wallet', 'No wallet is bound to this account yet.');
      // Custody is still undecided (README §1); the app reports its own model, the server only the address.
      return { address: user.walletAddress, custody: 'self', backedUp: false };
    },
  });

  /**
   * Activity the server caused: star exchanges, payments (orders, packs, seeds, shoes). Incoming
   * transfers from outside the app come from an indexer, which is not wired up yet.
   */
  app.get('/v1/wallet/transactions', {
    preHandler: requireUser,
    handler: async (request) => {
      const user = currentUser(request);
      const { rows: exchanges } = await pool.query<{ tx_hash: string | null; alli_amount: string; to_address: string; status: string; created_at: Date; sparkles: string }>(
        `SELECT tx_hash, alli_amount::text, to_address, status, created_at, sparkles::text
           FROM redemptions WHERE user_id = $1 AND tx_hash IS NOT NULL ORDER BY created_at DESC LIMIT 50`,
        [user.id],
      );
      const { rows: payments } = await pool.query<{ id: string; tx_hash: string; kind: string; symbol: string; amount: string; confirmed_at: Date }>(
        `SELECT id, tx_hash, kind, symbol, amount::text, confirmed_at FROM payment_intents
          WHERE user_id = $1 AND status = 'confirmed' ORDER BY confirmed_at DESC LIMIT 50`,
        [user.id],
      );
      const LABEL: Record<string, string> = { runs: 'Run pack', membership: 'Membership', seed: 'Seed', shoe: 'Shoe upgrade', order: 'Market order' };
      return [
        ...exchanges.map((r) => ({
          hash: r.tx_hash!,
          direction: 'in' as const,
          symbol: 'ALLI' as const,
          amount: r.alli_amount,
          counterparty: env.REWARD_CLAIM_ADDRESS ?? '0x0000000000000000000000000000000000000000',
          status: r.status === 'settled' ? ('confirmed' as const) : ('pending' as const),
          timestamp: r.created_at.getTime(),
          memo: `Star exchange · ${fromSparkles(Number(r.sparkles))} ★`,
        })),
        ...payments.map((r) => ({
          hash: r.tx_hash,
          direction: 'out' as const,
          symbol: r.symbol,
          amount: (Number(BigInt(r.amount) / 10n ** 12n) / 1e6).toString(),
          counterparty: env.PAYMENT_ROUTER_ADDRESS ?? '',
          status: 'confirmed' as const,
          timestamp: r.confirmed_at.getTime(),
          memo: LABEL[r.kind] ?? r.kind,
        })),
      ].sort((a, b) => b.timestamp - a.timestamp);
    },
  });

  app.get('/v1/wallet/prices', async () => ({
    ALLI: env.ALLI_USD_PRICE,
    USDT: 1,
    BNB: env.BNB_USD_PRICE,
    asOf: Date.now(),
  }));
}
