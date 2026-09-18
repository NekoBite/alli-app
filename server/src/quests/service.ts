import { pool, transaction, type Db } from '../db/pool.ts';
import {
  qualifies,
  questForWeek,
  rewardFor,
  standing,
  toSparkles,
  weekStart,
  type QuestMetric,
  type QuestResult,
  type QuestSnapshot,
  type WeeklyQuest,
} from '../shared/index.ts';

/**
 * The community quest. Contributions are written by the handlers that see
 * the actions (the garden service, the run service); the phone never sends
 * one. Weeks close lazily, on the first read after Monday 00:00 UTC, which
 * is fine for a proof of concept and becomes a scheduled job later.
 */

/** YYYY-MM-DD (UTC) of the Monday that starts the week containing `ms`. */
export function weekKey(ms: number): string {
  return new Date(weekStart(ms)).toISOString().slice(0, 10);
}

export async function recordContribution(
  db: Db,
  userId: string,
  metric: QuestMetric,
  amount: number,
  now: number,
): Promise<void> {
  if (amount <= 0) return;
  await db.query(
    `INSERT INTO quest_contributions (week_start, user_id, metric, amount)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (week_start, user_id, metric)
     DO UPDATE SET amount = quest_contributions.amount + EXCLUDED.amount`,
    [weekKey(now), userId, metric, Math.round(amount)],
  );
}

async function communityTotal(db: Db | typeof pool, week: string, metric: QuestMetric): Promise<number> {
  const { rows } = await db.query<{ total: string | null }>(
    'SELECT sum(amount)::bigint AS total FROM quest_contributions WHERE week_start = $1 AND metric = $2',
    [week, metric],
  );
  return Number(rows[0]?.total ?? 0);
}

/** Reach quests count players who moved the metric; stay-under quests count everyone active that week. */
async function contributorCount(db: Db | typeof pool, week: string, quest: WeeklyQuest): Promise<number> {
  const { rows } =
    quest.kind === 'reach'
      ? await db.query<{ n: string }>(
          'SELECT count(*) AS n FROM quest_contributions WHERE week_start = $1 AND metric = $2 AND amount > 0',
          [week, quest.metric],
        )
      : await db.query<{ n: string }>(
          'SELECT count(DISTINCT user_id) AS n FROM quest_contributions WHERE week_start = $1',
          [week],
        );
  return Number(rows[0]?.n ?? 0);
}

async function mineFor(db: Db | typeof pool, week: string, userId: string, metric: QuestMetric): Promise<number> {
  const { rows } = await db.query<{ amount: string }>(
    'SELECT amount FROM quest_contributions WHERE week_start = $1 AND user_id = $2 AND metric = $3',
    [week, userId, metric],
  );
  return Number(rows[0]?.amount ?? 0);
}

/**
 * Closes one week, once. Pays every player who did their part into the star
 * ledger and books the carbon delta on their garden. Safe to call twice: the
 * quest_weeks row is the receipt, taken under a lock.
 */
export async function closeWeek(weekStartMs: number): Promise<void> {
  const quest = questForWeek(weekStartMs);
  const week = weekKey(weekStartMs);
  const closedOn = new Date(quest.weekEnd).toISOString().slice(0, 10);

  await transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`quest-week-${week}`]);
    const { rows: done } = await db.query('SELECT 1 FROM quest_weeks WHERE week_start = $1', [week]);
    if (done.length > 0) return;

    const community = await communityTotal(db, week, quest.metric);
    const contributors = await contributorCount(db, week, quest);
    const outcome = standing({ quest, community });
    await db.query(
      `INSERT INTO quest_weeks (week_start, quest_id, community, contributors, outcome)
       VALUES ($1, $2, $3, $4, $5)`,
      [week, quest.id, community, contributors, outcome],
    );

    // Who is judged: for a reach quest, everyone who moved the metric; for a
    // stay-under quest, everyone active that week, with 0 if they never used it.
    const { rows: players } = await db.query<{ user_id: string; mine: string | null }>(
      `SELECT u.user_id, m.amount AS mine
         FROM (SELECT DISTINCT user_id FROM quest_contributions WHERE week_start = $1) u
         LEFT JOIN quest_contributions m
           ON m.week_start = $1 AND m.user_id = u.user_id AND m.metric = $2`,
      [week, quest.metric],
    );

    for (const player of players) {
      const mine = Number(player.mine ?? 0);
      if (quest.kind === 'reach' && mine <= 0) continue;
      const qualified = qualifies(quest, mine);
      const paid = qualified ? rewardFor(quest, outcome) : 0;
      const sparkles = toSparkles(paid);

      await db.query(
        `INSERT INTO quest_payouts (week_start, user_id, mine, qualified, paid_sparkles)
         VALUES ($1, $2, $3, $4, $5)`,
        [week, player.user_id, mine, qualified, sparkles],
      );
      if (sparkles > 0) {
        await db.query(
          `INSERT INTO star_ledger (user_id, delta, reason, day, note)
           VALUES ($1, $2, 'quest', $3, $4)`,
          [player.user_id, sparkles, closedOn, `${quest.title} · ${outcome}`],
        );
      }
      if (qualified && outcome !== 'none' && quest.reward.carbonDelta !== 0) {
        await db.query(
          `INSERT INTO gardens (user_id, carbon_adjustment) VALUES ($1, $2)
           ON CONFLICT (user_id) DO UPDATE
             SET carbon_adjustment = gardens.carbon_adjustment + EXCLUDED.carbon_adjustment`,
          [player.user_id, quest.reward.carbonDelta],
        );
      }
    }
  });
}

/** Closes every finished week that saw a contribution and has no receipt yet. */
export async function closeFinishedWeeks(now: number): Promise<void> {
  const { rows } = await pool.query<{ week_start: string }>(
    `SELECT DISTINCT week_start::text AS week_start FROM quest_contributions
      WHERE week_start < $1
        AND week_start NOT IN (SELECT week_start FROM quest_weeks)
      ORDER BY week_start`,
    [weekKey(now)],
  );
  for (const row of rows) {
    await closeWeek(Date.parse(`${row.week_start}T00:00:00Z`));
  }
}

async function lastResult(userId: string, now: number): Promise<QuestResult | undefined> {
  const previous = weekStart(now) - 7 * 86_400_000;
  const week = weekKey(previous);
  const { rows } = await pool.query<{
    community: string;
    outcome: QuestResult['outcome'];
    mine: string | null;
    qualified: boolean | null;
    paid_sparkles: number | null;
  }>(
    `SELECT w.community, w.outcome, p.mine, p.qualified, p.paid_sparkles
       FROM quest_weeks w
       LEFT JOIN quest_payouts p ON p.week_start = w.week_start AND p.user_id = $2
      WHERE w.week_start = $1`,
    [week, userId],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    quest: questForWeek(previous),
    community: Number(row.community),
    mine: Number(row.mine ?? 0),
    outcome: row.outcome,
    qualified: row.qualified ?? false,
    paidStars: (row.paid_sparkles ?? 0) / 100,
  };
}

export async function getWeekly(userId: string, now: number = Date.now()): Promise<QuestSnapshot> {
  await closeFinishedWeeks(now);
  const quest = questForWeek(now);
  const week = weekKey(now);
  const [community, contributors, mine, last] = await Promise.all([
    communityTotal(pool, week, quest.metric),
    contributorCount(pool, week, quest),
    mineFor(pool, week, userId, quest.metric),
    lastResult(userId, now),
  ]);
  return { current: { quest, community, contributors, mine }, last, serverTime: now };
}
