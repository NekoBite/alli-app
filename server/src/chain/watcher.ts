import { Contract, JsonRpcProvider, type EventLog } from 'ethers';

import { env } from '../config/env.ts';
import { pool } from '../db/pool.ts';
import { confirmPayment } from '../payments/service.ts';

const ROUTER_EVENTS = [
  'event Paid(bytes32 indexed id, address indexed payer, address indexed token, uint256 amount, uint8 kind)',
];
/** Blocks to wait before trusting an event. BSC finality is fast; a few blocks guards against reorgs. */
const CONFIRMATIONS = 3;
/** Most blocks to scan per poll, so a long outage catches up in bounded steps. */
const MAX_RANGE = 2_000;

/**
 * Polls PaymentRouter for `Paid` events and hands each to confirmPayment, which is idempotent.
 * The scan position lives in the database, so a restart resumes where it stopped instead of
 * rescanning or skipping. Polling rather than a websocket subscription: public BSC RPCs drop
 * subscriptions, and a missed push is a missed payment.
 */
export function startPaymentWatcher(log: { info: (o: object, m: string) => void; error: (o: object, m: string) => void }): () => void {
  if (!env.BSC_RPC_URL || !env.PAYMENT_ROUTER_ADDRESS || env.PAYMENT_POLL_SECONDS === 0) return () => undefined;
  const provider = new JsonRpcProvider(env.BSC_RPC_URL);
  const router = new Contract(env.PAYMENT_ROUTER_ADDRESS, ROUTER_EVENTS, provider);
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async () => {
    try {
      const head = (await provider.getBlockNumber()) - CONFIRMATIONS;
      const { rows } = await pool.query<{ block: string }>(`SELECT block FROM chain_cursors WHERE name = 'payments'`);
      // First run: start from the head rather than genesis; intents older than the watcher cannot exist.
      const from = rows[0] ? Number(rows[0].block) + 1 : head;
      const to = Math.min(head, from + MAX_RANGE);
      if (to >= from) {
        const events = (await router.queryFilter(router.filters.Paid!(), from, to)) as EventLog[];
        for (const e of events) {
          const [id, payer, token, amount] = e.args as unknown as [string, string, string, bigint];
          const result = await confirmPayment({ id, payer, token, amount, txHash: e.transactionHash });
          log.info({ id, txHash: e.transactionHash, result }, 'payment event');
        }
        await pool.query(
          `INSERT INTO chain_cursors (name, block) VALUES ('payments', $1)
           ON CONFLICT (name) DO UPDATE SET block = EXCLUDED.block`,
          [to],
        );
      }
    } catch (error) {
      log.error({ err: error }, 'payment watcher tick failed');
    } finally {
      if (!stopped) timer = setTimeout(() => void tick(), env.PAYMENT_POLL_SECONDS * 1000);
    }
  };
  void tick();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
