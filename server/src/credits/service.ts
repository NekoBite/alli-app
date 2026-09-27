import { pool, type Db } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import { RUN_CREDIT_RULES } from '../shared/commerce.ts';

const DAY_MS = 86_400_000;
/** One membership period. Renewing early extends from the current end, never loses paid days. */
export const MEMBERSHIP_PERIOD_MS = 30 * DAY_MS;

export type Entitlement = {
  runsLeft: number;
  runsThisMonth: number;
  extraRunsBoughtThisMonth: number;
  membership: {
    status: 'active' | 'expired' | 'none';
    activeUntil?: number;
    runsPerRenewal: number;
    priceUsdt: number;
  };
  serverTime: number;
};

/** The run-credit balance and membership, as GET /v1/run/entitlement returns them. */
export async function entitlement(db: Db | typeof pool, userId: string, now = Date.now()): Promise<Entitlement> {
  const { rows } = await db.query<{ left: string | null; runs: string | null; bought: string | null }>(
    `SELECT sum(delta)::bigint AS left,
            -sum(delta) FILTER (WHERE reason = 'run' AND month = date_trunc('month', to_timestamp($2/1000.0))::date)::bigint AS runs,
            sum(delta) FILTER (WHERE reason = 'pack' AND month = date_trunc('month', to_timestamp($2/1000.0))::date)::bigint AS bought
       FROM credit_ledger WHERE user_id = $1`,
    [userId, now],
  );
  const { rows: m } = await db.query<{ active_until: Date }>(
    'SELECT active_until FROM memberships WHERE user_id = $1',
    [userId],
  );
  const until = m[0]?.active_until.getTime();
  return {
    runsLeft: Number(rows[0]?.left ?? 0),
    runsThisMonth: Number(rows[0]?.runs ?? 0),
    extraRunsBoughtThisMonth: Number(rows[0]?.bought ?? 0),
    membership: {
      status: until === undefined ? 'none' : until > now ? 'active' : 'expired',
      activeUntil: until,
      runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
      priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
    },
    serverTime: now,
  };
}

export async function membershipActive(db: Db | typeof pool, userId: string, now = Date.now()): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM memberships WHERE user_id = $1 AND active_until > to_timestamp($2/1000.0)', [
    userId,
    now,
  ]);
  return rows.length > 0;
}

/**
 * Refuses a run when the account has no credit. Call under the user's row lock, before the run is
 * judged, so a runner out of credits is told so instead of having a run silently discarded.
 */
export async function assertCanRun(db: Db, userId: string): Promise<void> {
  const { rows } = await db.query<{ left: string | null }>(
    'SELECT sum(delta)::bigint AS left FROM credit_ledger WHERE user_id = $1',
    [userId],
  );
  if (Number(rows[0]?.left ?? 0) <= 0) {
    throw new ApiError(
      402,
      'no_run_credits',
      'You are out of run credits. Renew your membership or buy a pack of runs.',
    );
  }
}

/** Spends one credit for a recorded run. The unique index on run_id makes a retry spend nothing. */
export async function spendCredit(db: Db, userId: string, runId: string): Promise<void> {
  await db.query(
    `INSERT INTO credit_ledger (user_id, delta, reason, run_id) VALUES ($1, -1, 'run', $2)
     ON CONFLICT (run_id) WHERE run_id IS NOT NULL DO NOTHING`,
    [userId, runId],
  );
}

/** Credits bought as a pack. Idempotent per payment intent. */
export async function grantPack(db: Db, userId: string, runs: number, intentId: string, now = Date.now()): Promise<void> {
  // The monthly ceiling is checked at quote time. A payment that lands after the month turned is
  // honoured anyway: refusing credits someone has paid for is worse than a few over the cap.
  void now;
  await db.query(
    `INSERT INTO credit_ledger (user_id, delta, reason, intent_id) VALUES ($1, $2, 'pack', $3)
     ON CONFLICT (intent_id) WHERE intent_id IS NOT NULL DO NOTHING`,
    [userId, runs, intentId],
  );
}

/** Extends the membership by one period from its current end (or now) and grants its credits. */
export async function renewMembership(db: Db, userId: string, intentId: string, now = Date.now()): Promise<void> {
  const { rowCount } = await db.query(
    `INSERT INTO credit_ledger (user_id, delta, reason, intent_id) VALUES ($1, $2, 'membership', $3)
     ON CONFLICT (intent_id) WHERE intent_id IS NOT NULL DO NOTHING`,
    [userId, RUN_CREDIT_RULES.runsPerRenewal, intentId],
  );
  if (!rowCount) return; // already fulfilled
  await db.query(
    `INSERT INTO memberships (user_id, active_until) VALUES ($1, to_timestamp($2/1000.0))
     ON CONFLICT (user_id) DO UPDATE
       SET active_until = greatest(memberships.active_until, to_timestamp($3/1000.0)) + ($4 || ' milliseconds')::interval,
           updated_at = now()`,
    [userId, now + MEMBERSHIP_PERIOD_MS, now, String(MEMBERSHIP_PERIOD_MS)],
  );
}

/** Sign-up credits (SIGNUP_RUN_CREDITS), and the test helper's grant. */
export async function grantCredits(db: Db | typeof pool, userId: string, runs: number, reason: 'signup' | 'adjustment'): Promise<void> {
  if (runs <= 0) return;
  await db.query('INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, $2, $3)', [userId, runs, reason]);
}
