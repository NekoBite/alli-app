import { pool, type Db } from '../db/pool.ts';

type Queryable = Db | typeof pool;

/** Direct referrals who must hold Silver or better before an account may buy Gold. */
export const GOLD_UNLOCK_KEY = 'gold_unlock_silver_directs';
export const GOLD_UNLOCK_DEFAULT = 5;

export async function goldUnlockRequirement(db: Queryable = pool): Promise<number> {
  const { rows } = await db.query<{ value: number }>('SELECT value FROM app_settings WHERE key = $1', [GOLD_UNLOCK_KEY]);
  const v = rows[0]?.value;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : GOLD_UNLOCK_DEFAULT;
}

/** Direct (Gen 1) referrals of `userId` in ALLI RUN who hold Silver or better. */
export async function silverDirects(db: Queryable, userId: string): Promise<number> {
  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*)::text AS n FROM sponsorships s JOIN users u ON u.id = s.user_id
      WHERE s.program = 'run' AND s.sponsor_id = $1 AND u.shoe_tier IN ('silver', 'gold')`,
    [userId],
  );
  return Number(rows[0]?.n ?? 0);
}
