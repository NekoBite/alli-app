import { pool, transaction, type Db } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import { assertCanRun, spendCredit } from '../credits/service.ts';
import { recordContribution } from '../quests/service.ts';
import {
  calculateReward,
  creditStepSamples,
  DEFAULT_SHOE_TIER,
  fromSparkles,
  REWARD_RULES,
  starsToAlli,
  summarizeTrack,
  toSparkles,
  type GeoPoint,
  type RewardBreakdown,
  type ShoeTier,
  type StepSample,
} from '../shared/run.ts';

export type SubmitRunInput = {
  clientRunId: string;
  startedAt: number;
  endedAt?: number;
  track: GeoPoint[];
  /** Raw pedometer totals. The credited count is derived here, never accepted. */
  stepSamples?: StepSample[];
  /** Client's own day bucket, so the quest follows the runner's local midnight. */
  day: string;
};

export type RunRecord = {
  id: string;
  clientRunId: string;
  startedAt: string;
  endedAt: string | null;
  distanceMetres: number;
  movingSeconds: number;
  steps: number;
  reward: RewardBreakdown;
  confirmed: true;
};

export type Profile = {
  starsBalance: number;
  starsEarnedToday: number;
  stepsToday: number;
  streakDays: number;
  shoeTier: ShoeTier;
};

/**
 * The ledger counts in sparkles (hundredths of a star, migration 003) so the
 * garden can pay fractions of a star. These two are the only reads of it, and
 * they convert on the way out; the writes below convert on the way in. Every
 * number outside this module is in stars.
 */
export async function starsBalance(db: Db | typeof pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ balance: string | null }>(
    'SELECT sum(delta)::bigint AS balance FROM star_ledger WHERE user_id = $1',
    [userId],
  );
  return fromSparkles(Number(rows[0]?.balance ?? 0));
}

async function starsEarnedOn(db: Db | typeof pool, userId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ total: string | null }>(
    `SELECT sum(delta)::bigint AS total FROM star_ledger
      WHERE user_id = $1 AND day = $2 AND reason = 'run'`,
    [userId, day],
  );
  return fromSparkles(Number(rows[0]?.total ?? 0));
}

/**
 * Steps the quest has banked today. Only unflagged runs contribute — a run the
 * validator rejected adds nothing, which is the same rule `calculateReward`
 * applies to the run in front of it.
 */
async function stepsOn(db: Db | typeof pool, userId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ total: string | null }>(
    `SELECT sum(steps)::bigint AS total FROM runs
      WHERE user_id = $1 AND day = $2 AND cardinality(flags) = 0`,
    [userId, day],
  );
  return Number(rows[0]?.total ?? 0);
}

async function shoeTierOf(db: Db | typeof pool, userId: string): Promise<ShoeTier> {
  const { rows } = await db.query<{ shoe_tier: ShoeTier }>(
    'SELECT shoe_tier FROM users WHERE id = $1',
    [userId],
  );
  return rows[0]?.shoe_tier ?? DEFAULT_SHOE_TIER;
}

/**
 * Consecutive days, counting back from `day`, on which the quest was completed.
 * Today not having completed yet does not break the streak — it is only broken
 * by a *finished* day with no star in it.
 */
async function streakDays(db: Db | typeof pool, userId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ day: string }>(
    `SELECT DISTINCT day::text AS day FROM star_ledger
      WHERE user_id = $1 AND reason = 'run' AND delta > 0 AND day <= $2
      ORDER BY day DESC LIMIT 400`,
    [userId, day],
  );
  if (rows.length === 0) return 0;

  const days = rows.map((r) => r.day);
  const oneDay = 86_400_000;
  const asDate = (d: string) => Date.parse(`${d}T00:00:00Z`);

  // Anchor on the most recent completed day, but only if it is today or
  // yesterday; anything older means the streak already lapsed.
  const gapFromToday = Math.round((asDate(day) - asDate(days[0]!)) / oneDay);
  if (gapFromToday > 1) return 0;

  let streak = 1;
  for (let i = 1; i < days.length; i += 1) {
    const gap = Math.round((asDate(days[i - 1]!) - asDate(days[i]!)) / oneDay);
    if (gap !== 1) break;
    streak += 1;
  }
  return streak;
}

export async function getProfile(userId: string, day: string): Promise<Profile> {
  const [balance, earnedToday, steps, streak, shoeTier] = await Promise.all([
    starsBalance(pool, userId),
    starsEarnedOn(pool, userId, day),
    stepsOn(pool, userId, day),
    streakDays(pool, userId, day),
    shoeTierOf(pool, userId),
  ]);

  return {
    starsBalance: balance,
    starsEarnedToday: earnedToday,
    stepsToday: steps,
    streakDays: streak,
    shoeTier,
  };
}

export async function listRuns(userId: string, limit = 50): Promise<RunRecord[]> {
  const { rows } = await pool.query<{
    id: string;
    client_run_id: string;
    started_at: string;
    ended_at: string | null;
    distance_metres: number;
    moving_seconds: number;
    steps: number | null;
    reward: RewardBreakdown;
  }>(
    `SELECT id, client_run_id, started_at, ended_at, distance_metres,
            moving_seconds, steps, reward
       FROM runs WHERE user_id = $1
      ORDER BY started_at DESC LIMIT $2`,
    [userId, limit],
  );

  return rows.map((r) => ({
    id: r.id,
    clientRunId: r.client_run_id,
    startedAt: r.started_at,
    endedAt: r.ended_at,
    distanceMetres: r.distance_metres,
    movingSeconds: r.moving_seconds,
    steps: r.steps ?? 0,
    reward: r.reward,
    confirmed: true,
  }));
}

/**
 * The trust boundary.
 *
 * Everything the phone claimed about distance, duration, steps and stars is
 * thrown away. Only the raw track and the raw pedometer totals survive the
 * trip, and the server recomputes the result from them with the same functions
 * the app used for its preview. If the two disagree, the server is right by
 * definition.
 */
export async function submitRun(userId: string, input: SubmitRunInput): Promise<RunRecord> {
  return transaction(async (db) => {
    // Serialises this user's concurrent submissions. Without it two runs
    // uploaded together both read the same "steps so far today" and each can
    // complete the quest — the day's total has to be read and written under
    // the same lock.
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    // A retried upload must not pay twice. Returning the stored result rather
    // than erroring keeps the client's retry loop simple and correct.
    const { rows: existing } = await db.query<{
      id: string;
      client_run_id: string;
      started_at: string;
      ended_at: string | null;
      distance_metres: number;
      moving_seconds: number;
      steps: number | null;
      reward: RewardBreakdown;
    }>(
      `SELECT id, client_run_id, started_at, ended_at, distance_metres,
              moving_seconds, steps, reward
         FROM runs WHERE user_id = $1 AND client_run_id = $2`,
      [userId, input.clientRunId],
    );
    if (existing[0]) {
      const r = existing[0];
      return {
        id: r.id,
        clientRunId: r.client_run_id,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        distanceMetres: r.distance_metres,
        movingSeconds: r.moving_seconds,
        steps: r.steps ?? 0,
        reward: r.reward,
        confirmed: true as const,
      };
    }

    // One credit per recorded run, checked under the same lock (docs/architecture.md §2).
    await assertCanRun(db, userId);

    // Recompute from the raw track. The identical function the phone ran.
    const stats = summarizeTrack(input.track);

    // And re-credit the steps against that track. A client that reports a
    // million steps over a track that never moved credits none of them, which
    // is what stops a shaken phone completing the quest and minting a star.
    const steps = creditStepSamples(input.track, input.stepSamples ?? []).steps;

    const stepsToday = await stepsOn(db, userId, input.day);
    const starsEarnedToday = await starsEarnedOn(db, userId, input.day);
    const shoeTier = await shoeTierOf(db, userId);

    const reward = calculateReward(
      {
        distanceMetres: stats.distanceMetres,
        movingSeconds: stats.movingSeconds,
        track: input.track,
        steps,
      },
      {
        stepsToday,
        starsEarnedToday,
        shoeTier,
        rejectedPoints: stats.rejectedPoints,
      },
    );

    const { rows: inserted } = await db.query<{ id: string; started_at: string; ended_at: string | null }>(
      `INSERT INTO runs (
         user_id, client_run_id, started_at, ended_at, track,
         distance_metres, moving_seconds, rejected_points, steps,
         reward, sparkles_awarded, flags, day
       ) VALUES ($1,$2,to_timestamp($3/1000.0),
                 CASE WHEN $4::bigint IS NULL THEN NULL ELSE to_timestamp($4/1000.0) END,
                 $5,$6,$7,$8,$9,$10,$11,$12,$13)
       RETURNING id, started_at, ended_at`,
      [
        userId,
        input.clientRunId,
        input.startedAt,
        input.endedAt ?? null,
        JSON.stringify(input.track),
        stats.distanceMetres,
        stats.movingSeconds,
        stats.rejectedPoints,
        // The credited count, not the reported one — `runs.steps` is what the
        // day's total is summed from, so it must be the number that was judged.
        reward.eligibleSteps,
        JSON.stringify(reward),
        toSparkles(reward.stars),
        reward.flags,
        input.day,
      ],
    );
    const run = inserted[0]!;
    await spendCredit(db, userId, run.id);

    // Credited steps count towards a community step quest.
    if (reward.eligibleSteps > 0) {
      await recordContribution(db, userId, 'steps', reward.eligibleSteps, Date.now());
    }

    // A run that did not complete the quest still gets a run row — its steps
    // are what the day accumulates — but no ledger entry, because no star moved.
    if (reward.stars > 0) {
      await db.query(
        `INSERT INTO star_ledger (user_id, delta, reason, run_id, day, note)
         VALUES ($1, $2, 'run', $3, $4, $5)`,
        [
          userId,
          toSparkles(reward.stars),
          run.id,
          input.day,
          `Daily quest · ${reward.shoeMultiplier}× ${shoeTier}`,
        ],
      );
    }

    return {
      id: run.id,
      clientRunId: input.clientRunId,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      distanceMetres: stats.distanceMetres,
      movingSeconds: stats.movingSeconds,
      steps: reward.eligibleSteps,
      reward,
      confirmed: true as const,
    };
  });
}

export type ExchangeRequest = {
  userId: string;
  stars: number;
  toAddress: string;
  day: string;
};

/**
 * Debits stars and opens an exchange. The caller settles it on-chain and then
 * calls `settleExchange` or `failExchange`.
 *
 * Split in two on purpose: the debit must be committed before a transfer is
 * broadcast, or a crash between the two pays out tokens the ledger never
 * charged for. This way a crash leaves a `pending` row the reconciler can find.
 */
export async function openExchange({ userId, stars, toAddress, day }: ExchangeRequest) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    if (!Number.isInteger(stars) || stars <= 0) {
      throw ApiError.badRequest('invalid_amount', 'Exchange a whole number of stars.');
    }

    const balance = await starsBalance(db, userId);
    if (stars > balance) {
      throw ApiError.badRequest('insufficient_stars', 'You do not have that many stars.');
    }

    const alli = starsToAlli(stars);
    const sparkles = toSparkles(stars);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO redemptions (user_id, sparkles, alli_amount, to_address, day)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, sparkles, alli.toString(), toAddress, day],
    );
    const redemptionId = rows[0]!.id;

    await db.query(
      `INSERT INTO star_ledger (user_id, delta, reason, redemption_id, day, note)
       VALUES ($1, $2, 'redemption', $3, $4, $5)`,
      [userId, -sparkles, redemptionId, day, `Exchanged for ${alli} ALLI`],
    );

    return { redemptionId, alli };
  });
}

export async function settleExchange(redemptionId: string, txHash: string): Promise<void> {
  await pool.query(
    `UPDATE redemptions SET status = 'settled', tx_hash = $2, settled_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [redemptionId, txHash],
  );
}

/** Marks the exchange failed and returns the stars, in one transaction. */
export async function failExchange(redemptionId: string, reason: string): Promise<void> {
  await transaction(async (db) => {
    const { rows } = await db.query<{ user_id: string; sparkles: number; day: string }>(
      `UPDATE redemptions SET status = 'failed', failure = $2, settled_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING user_id, sparkles, day::text AS day`,
      [redemptionId, reason.slice(0, 500)],
    );
    const row = rows[0];
    if (!row) return; // Already settled or already failed — nothing to undo.

    await db.query(
      `INSERT INTO star_ledger (user_id, delta, reason, redemption_id, day, note)
       VALUES ($1, $2, 'adjustment', $3, $4, $5)`,
      [row.user_id, row.sparkles, redemptionId, row.day, 'Refund: exchange failed'],
    );
  });
}

/** Re-exported so routes can quote the rules without reaching past this module. */
export { REWARD_RULES };
