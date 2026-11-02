import { pool, transaction, type Db } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import {
  PROGRAM_ORDER,
  REFERRAL_RULES,
  validateRates,
  type ReferralProgramId,
  type ReferralRates,
} from '../shared/commerce.ts';

type Queryable = Db | typeof pool;

/**
 * The commission rates in force for a program at a moment: the rate set with the latest
 * `effective_from` not after `at`, else the code defaults. A set with a future date is stored but
 * not yet in force, so a change can be scheduled.
 */
export async function ratesAt(db: Queryable, program: ReferralProgramId, at: number = Date.now()): Promise<readonly number[]> {
  const { rows } = await db.query<{ generation: number; rate_bps: number }>(
    `SELECT generation, rate_bps FROM referral_rates
      WHERE program = $1
        AND effective_from = (SELECT max(effective_from) FROM referral_rates
                               WHERE program = $1 AND effective_from <= to_timestamp($2/1000.0))
      ORDER BY generation`,
    [program, at],
  );
  if (rows.length === 0) return REFERRAL_RULES[program].ratesBps;
  // A set is written whole and contiguous (setRates), so the rows are Gen 1..n.
  return rows.map((r) => r.rate_bps);
}

/** Every program's rates in force now, as `GET /v1/referrals/rates` serves them. */
export async function allRates(db: Queryable = pool, at: number = Date.now()): Promise<ReferralRates> {
  const entries = await Promise.all(PROGRAM_ORDER.map(async (p) => [p, await ratesAt(db, p, at)] as const));
  return Object.fromEntries(entries) as ReferralRates;
}

export type SetRatesInput = {
  program: ReferralProgramId;
  /** Gen 1 first, in basis points of the commissionable amount. */
  ratesBps: readonly number[];
  /** ms since epoch. A future date schedules the change; commissions already booked never move. */
  effectiveFrom: number;
  setBy?: string;
  note?: string;
};

/**
 * Writes a whole rate set. This is what the admin dashboard calls; until it exists, an operator
 * calls it directly.
 *
 * A set is refused when it could pay out more than a purchase, and when one already exists for that
 * program at that exact moment: sets are never overwritten, so the history of what was in force
 * stays true.
 */
export async function setRates(input: SetRatesInput): Promise<void> {
  const problem = validateRates(input.ratesBps);
  if (problem) throw ApiError.badRequest('invalid_rates', problem);
  if (!PROGRAM_ORDER.includes(input.program)) throw ApiError.badRequest('unknown_program', 'Unknown program.');
  if (!Number.isFinite(input.effectiveFrom)) throw ApiError.badRequest('invalid_date', 'Give the date the rates take effect.');

  await transaction(async (db) => {
    // Serialise writers per program so two operators cannot interleave halves of two sets.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`referral_rates:${input.program}`]);
    const { rows } = await db.query(
      `SELECT 1 FROM referral_rates WHERE program = $1 AND effective_from = to_timestamp($2/1000.0) LIMIT 1`,
      [input.program, input.effectiveFrom],
    );
    if (rows.length > 0) {
      throw ApiError.conflict('rates_exist', 'Rates for that program already start at that moment. Choose a later time.');
    }
    for (const [i, bps] of input.ratesBps.entries()) {
      await db.query(
        `INSERT INTO referral_rates (program, generation, rate_bps, effective_from, set_by, note)
         VALUES ($1, $2, $3, to_timestamp($4/1000.0), $5, $6)`,
        [input.program, i + 1, bps, input.effectiveFrom, input.setBy ?? null, input.note ?? null],
      );
    }
  });
}

/** Every rate set ever written, newest first, for the dashboard's "who changed this and when". */
export async function rateHistory(program: ReferralProgramId) {
  const { rows } = await pool.query<{ effective_from: Date; rates: number[]; set_by: string | null; note: string | null; created_at: Date }>(
    `SELECT effective_from, array_agg(rate_bps ORDER BY generation) AS rates,
            max(set_by) AS set_by, max(note) AS note, min(created_at) AS created_at
       FROM referral_rates WHERE program = $1
      GROUP BY effective_from ORDER BY effective_from DESC`,
    [program],
  );
  return rows.map((r) => ({
    effectiveFrom: r.effective_from.toISOString(),
    ratesBps: r.rates,
    setBy: r.set_by,
    note: r.note,
    createdAt: r.created_at.toISOString(),
  }));
}
