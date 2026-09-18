import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { pool, transaction } from '../src/db/pool.ts';
import { closeWeek, getWeekly, recordContribution, weekKey } from '../src/quests/service.ts';
import { questForWeek, WEEK_MS, weekStart, type WeeklyQuest } from '../src/shared/index.ts';
import { createUser, setupDb } from './helpers.ts';

after(async () => pool.end());

const DAY = 86_400_000;

/** The first week from `from` whose quest is of the given kind. */
function weekOfKind(from: number, kind: WeeklyQuest['kind']): { now: number; quest: WeeklyQuest } {
  for (let i = 0; i < 12; i += 1) {
    const now = from + i * WEEK_MS;
    const quest = questForWeek(now);
    if (quest.kind === kind) return { now, quest };
  }
  throw new Error(`no ${kind} quest within 12 weeks`);
}

async function contribute(userId: string, metric: WeeklyQuest['metric'], amount: number, now: number) {
  await transaction((db) => recordContribution(db, userId, metric, amount, now));
}

async function stars(userId: string): Promise<number> {
  const { rows } = await pool.query<{ total: string | null }>(
    'SELECT sum(delta)::bigint AS total FROM star_ledger WHERE user_id = $1',
    [userId],
  );
  return Number(rows[0]?.total ?? 0) / 100;
}

describe('weekly quest', () => {
  beforeEach(setupDb);

  it('adds up contributions into the community total, per week', async () => {
    const { now, quest } = weekOfKind(Date.UTC(2026, 8, 16, 12), 'reach');
    const a = await createUser();
    const b = await createUser();
    await contribute(a, quest.metric, 3, now);
    await contribute(a, quest.metric, 2, now);
    await contribute(b, quest.metric, 4, now);
    await contribute(b, quest.metric, 100, now + WEEK_MS);

    const snapshot = await getWeekly(a, now + DAY);
    assert.equal(snapshot.current.quest.id, quest.id);
    assert.equal(snapshot.current.community, 9);
    assert.equal(snapshot.current.contributors, 2);
    assert.equal(snapshot.current.mine, 5);
    assert.equal(snapshot.last, undefined);
    assert.equal(weekKey(now), new Date(weekStart(now)).toISOString().slice(0, 10));
  });

  it('closes a reach week once, paying those who did their part', async () => {
    const { now, quest } = weekOfKind(Date.UTC(2026, 8, 16, 12), 'reach');
    const doer = await createUser();
    const slacker = await createUser();
    const whale = await createUser();
    await contribute(doer, quest.metric, quest.personal, now);
    await contribute(slacker, quest.metric, Math.max(0, quest.personal - 1), now);
    await contribute(whale, quest.metric, quest.goal, now);

    await closeWeek(weekStart(now));
    await closeWeek(weekStart(now));

    const reward = quest.stretchGoal !== undefined && quest.goal + quest.personal + Math.max(0, quest.personal - 1) >= quest.stretchGoal
      ? quest.reward.stretchStars
      : quest.reward.stars;
    assert.equal(await stars(doer), reward);
    assert.equal(await stars(whale), reward);
    assert.equal(await stars(slacker), quest.personal > 1 ? 0 : reward);

    const { rows: weeks } = await pool.query('SELECT outcome FROM quest_weeks');
    assert.equal(weeks.length, 1, 'closed once');
    const { rows: ledger } = await pool.query("SELECT count(*)::int AS n FROM star_ledger WHERE reason = 'quest'");
    assert.equal(ledger[0]!.n, quest.personal > 1 ? 2 : 3, 'paid once each');

    if (quest.reward.carbonDelta !== 0) {
      const { rows } = await pool.query<{ carbon_adjustment: number }>(
        'SELECT carbon_adjustment FROM gardens WHERE user_id = $1',
        [doer],
      );
      assert.equal(rows[0]!.carbon_adjustment, quest.reward.carbonDelta);
    }

    const after = await getWeekly(doer, now + WEEK_MS + DAY);
    assert.equal(after.last?.quest.id, quest.id);
    assert.equal(after.last?.qualified, true);
    assert.equal(after.last?.paidStars, reward);
  });

  it('closes a stay-under week: active players who used none are paid, the cap holds the community', async () => {
    const { now, quest } = weekOfKind(Date.UTC(2026, 8, 16, 12), 'stayUnder');
    const clean = await createUser();
    const dirty = await createUser();
    await contribute(clean, 'compost', 2, now);
    await contribute(dirty, quest.metric, 1, now);

    await closeWeek(weekStart(now));
    assert.equal(await stars(clean), quest.reward.stretchStars, 'under the stretch cap, used none');
    assert.equal(await stars(dirty), 0);
  });

  it('closes finished weeks lazily on read and leaves the open one alone', async () => {
    const { now, quest } = weekOfKind(Date.UTC(2026, 8, 16, 12), 'reach');
    const user = await createUser();
    await contribute(user, quest.metric, quest.goal, now);
    await getWeekly(user, now + 2 * DAY);
    assert.equal((await pool.query('SELECT 1 FROM quest_weeks')).rows.length, 0, 'still open');
    await getWeekly(user, now + WEEK_MS);
    assert.equal((await pool.query('SELECT 1 FROM quest_weeks')).rows.length, 1, 'closed once it ended');
  });
});
