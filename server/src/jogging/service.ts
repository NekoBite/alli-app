import { pool, transaction, type Db } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import {
  calculateReward,
  pointsToAlli,
  REWARD_RULES,
  summarizeTrack,
  type GeoPoint,
  type RewardBreakdown,
} from '../shared/jogging.ts';

export type SubmitRunInput = {
  clientRunId: string;
  startedAt: number;
  endedAt?: number;
  track: GeoPoint[];
  steps?: number;
  /** Client's own day bucket, so the cap follows the runner's local midnight. */
  day: string;
};

export type RunRecord = {
  id: string;
  clientRunId: string;
  startedAt: string;
  endedAt: string | null;
  distanceMetres: number;
  movingSeconds: number;
  steps: number | null;
  reward: RewardBreakdown;
  confirmed: true;
};

export type Profile = {
  pointsBalance: number;
  pointsEarnedToday: number;
  multiplier: number;
  streakDays: number;
};

/**
 * Bonus for consecutive qualifying days. The client cannot supply this — it is
 * derived here from the ledger, because a multiplier the phone can set is a
 * multiplier the phone can set to 1000.
 */
export function streakMultiplier(streakDays: number): number {
  if (streakDays >= 30) return 1.25;
  if (streakDays >= 14) return 1.15;
  if (streakDays >= 7) return 1.1;
  if (streakDays >= 3) return 1.05;
  return 1;
}

async function pointsBalance(db: Db | typeof pool, userId: string): Promise<number> {
  const { rows } = await db.query<{ balance: string | null }>(
    'SELECT sum(delta)::bigint AS balance FROM points_ledger WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]?.balance ?? 0);
}

async function pointsEarnedOn(db: Db | typeof pool, userId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ total: string | null }>(
    `SELECT sum(delta)::bigint AS total FROM points_ledger
      WHERE user_id = $1 AND day = $2 AND reason = 'run'`,
    [userId, day],
  );
  return Number(rows[0]?.total ?? 0);
}

/**
 * Consecutive days, counting back from `day`, on which the user earned points.
 * Today not having earned yet does not break the streak — it is only broken by
 * a *completed* day with nothing in it.
 */
async function streakDays(db: Db | typeof pool, userId: string, day: string): Promise<number> {
  const { rows } = await db.query<{ day: string }>(
    `SELECT DISTINCT day::text AS day FROM points_ledger
      WHERE user_id = $1 AND reason = 'run' AND delta > 0 AND day <= $2
      ORDER BY day DESC LIMIT 400`,
    [userId, day],
  );
  if (rows.length === 0) return 0;

  const days = rows.map((r) => r.day);
  const oneDay = 86_400_000;
  const asDate = (d: string) => Date.parse(`${d}T00:00:00Z`);

  // Anchor on the most recent earning day, but only if it is today or
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
  const [balance, today, streak] = await Promise.all([
    pointsBalance(pool, userId),
    pointsEarnedOn(pool, userId, day),
    streakDays(pool, userId, day),
  ]);

  return {
    pointsBalance: balance,
    pointsEarnedToday: today,
    multiplier: streakMultiplier(streak),
    streakDays: streak,
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
    steps: r.steps,
    reward: r.reward,
    confirmed: true,
  }));
}

/**
 * The trust boundary.
 *
 * Everything the phone claimed about distance, duration and points is thrown
 * away. Only the raw track survives the trip, and the server recomputes the
 * result from it with the same functions the app used for its preview. If the
 * two disagree, the server is right by definition.
 */
export async function submitRun(userId: string, input: SubmitRunInput): Promise<RunRecord> {
  return transaction(async (db) => {
    // Serialises this user's concurrent submissions. Without it two runs
    // uploaded together both read "0 earned today" and each get a full day's
    // cap — the cap has to be read and written under the same lock.
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
        steps: r.steps,
        reward: r.reward,
        confirmed: true as const,
      };
    }

    // Recompute from the raw track. The identical function the phone ran.
    const stats = summarizeTrack(input.track);

    const earnedToday = await pointsEarnedOn(db, userId, input.day);
    const streak = await streakDays(db, userId, input.day);

    const reward = calculateReward(
      {
        distanceMetres: stats.distanceMetres,
        movingSeconds: stats.movingSeconds,
        track: input.track,
        steps: input.steps,
      },
      {
        pointsEarnedToday: earnedToday,
        multiplier: streakMultiplier(streak),
        rejectedPoints: stats.rejectedPoints,
      },
    );

    const { rows: inserted } = await db.query<{ id: string; started_at: string; ended_at: string | null }>(
      `INSERT INTO runs (
         user_id, client_run_id, started_at, ended_at, track,
         distance_metres, moving_seconds, rejected_points, steps,
         reward, points_awarded, flags, day
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
        input.steps ?? null,
        JSON.stringify(reward),
        reward.points,
        reward.flags,
        input.day,
      ],
    );
    const run = inserted[0]!;

    // A zero-point run still gets a run row — the user can see why it was
    // rejected — but no ledger entry, because nothing moved.
    if (reward.points > 0) {
      await db.query(
        `INSERT INTO points_ledger (user_id, delta, reason, run_id, day)
         VALUES ($1, $2, 'run', $3, $4)`,
        [userId, reward.points, run.id, input.day],
      );
    }

    return {
      id: run.id,
      clientRunId: input.clientRunId,
      startedAt: run.started_at,
      endedAt: run.ended_at,
      distanceMetres: stats.distanceMetres,
      movingSeconds: stats.movingSeconds,
      steps: input.steps ?? null,
      reward,
      confirmed: true as const,
    };
  });
}

export type RedemptionRequest = {
  userId: string;
  points: number;
  toAddress: string;
  day: string;
};

/**
 * Debits points and opens a redemption. The caller settles it on-chain and then
 * calls `settleRedemption` or `failRedemption`.
 *
 * Split in two on purpose: the debit must be committed before a transfer is
 * broadcast, or a crash between the two pays out tokens the ledger never
 * charged for. This way a crash leaves a `pending` row the reconciler can find.
 */
export async function openRedemption({ userId, points, toAddress, day }: RedemptionRequest) {
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    if (points <= 0) {
      throw ApiError.badRequest('invalid_amount', 'Redeem a positive number of points.');
    }
    if (points % REWARD_RULES.pointsPerAlli !== 0) {
      throw ApiError.badRequest(
        'invalid_amount',
        `Redeem in multiples of ${REWARD_RULES.pointsPerAlli} points (1 ALLI).`,
      );
    }

    const balance = await pointsBalance(db, userId);
    if (points > balance) {
      throw ApiError.badRequest('insufficient_points', 'You do not have that many points.');
    }

    const alli = pointsToAlli(points);
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO redemptions (user_id, points, alli_amount, to_address, day)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, points, alli.toString(), toAddress, day],
    );
    const redemptionId = rows[0]!.id;

    await db.query(
      `INSERT INTO points_ledger (user_id, delta, reason, redemption_id, day, note)
       VALUES ($1, $2, 'redemption', $3, $4, $5)`,
      [userId, -points, redemptionId, day, `Redeemed for ${alli} ALLI`],
    );

    return { redemptionId, alli };
  });
}

export async function settleRedemption(redemptionId: string, txHash: string): Promise<void> {
  await pool.query(
    `UPDATE redemptions SET status = 'settled', tx_hash = $2, settled_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [redemptionId, txHash],
  );
}

/** Marks the redemption failed and returns the points, in one transaction. */
export async function failRedemption(redemptionId: string, reason: string): Promise<void> {
  await transaction(async (db) => {
    const { rows } = await db.query<{ user_id: string; points: number; day: string }>(
      `UPDATE redemptions SET status = 'failed', failure = $2, settled_at = now()
        WHERE id = $1 AND status = 'pending'
        RETURNING user_id, points, day::text AS day`,
      [redemptionId, reason.slice(0, 500)],
    );
    const row = rows[0];
    if (!row) return; // Already settled or already failed — nothing to undo.

    await db.query(
      `INSERT INTO points_ledger (user_id, delta, reason, redemption_id, day, note)
       VALUES ($1, $2, 'adjustment', $3, $4, $5)`,
      [row.user_id, row.points, redemptionId, row.day, 'Refund: redemption failed'],
    );
  });
}
