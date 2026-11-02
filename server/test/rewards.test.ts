import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';

import { pool } from '../src/db/pool.ts';
import { REWARD_RULES, SHOES, toSparkles } from '../src/shared/run.ts';
import {
  failExchange,
  getProfile,
  openExchange,
  submitRun,
} from '../src/run/service.ts';
import { createUser, DAY, drivingTrack, goodTrack, setupDb, stationaryTrack, stepSamples } from './helpers.ts';

// File-scoped: closing the pool inside a suite would pull it out from under
// every suite that runs after it.
after(async () => pool.end());

/** 600 fixes at 50 steps per 5 of them: exactly the quest's 6,000 steps. */
const QUEST_FIXES = 600;

async function setShoeTier(userId: string, tier: 'leather' | 'silver' | 'gold'): Promise<void> {
  await pool.query('UPDATE users SET shoe_tier = $2 WHERE id = $1', [userId, tier]);
}

describe('daily quest', () => {
  beforeEach(setupDb);

  /**
   * A believable upload: the standard track, with a pedometer total every five
   * fixes — 50 steps per 25 s, a 120/min walk, well inside the cadence limit, so
   * all of it counts.
   */
  const run = (over: Partial<Parameters<typeof submitRun>[1]> = {}) => {
    const track = over.track ?? goodTrack(100);
    return {
      clientRunId: randomUUID(),
      startedAt: 1_700_000_000_000,
      track,
      stepSamples: stepSamples(track, 50),
      day: DAY,
      ...over,
    };
  };

  /** A run that clears the whole quest on its own. */
  const questRun = (over: Partial<Parameters<typeof submitRun>[1]> = {}) =>
    run({ track: goodTrack(QUEST_FIXES), ...over });

  it('banks steps from the re-credited samples without paying early', async () => {
    const userId = await createUser();
    const result = await submitRun(userId, run());

    // 20 windows of 50 steps = 1,000 steps, well short of the 6,000 goal.
    assert.deepEqual(result.reward.flags, []);
    assert.equal(result.reward.eligibleSteps, 1000);
    assert.equal(result.reward.stepsToday, 1000);
    assert.equal(result.reward.questCompleted, false);
    assert.equal(result.reward.stars, 0);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.stepsToday, 1000);
    assert.equal(profile.starsBalance, 0);
  });

  it('pays one star when the day crosses the goal, counting earlier runs', async () => {
    const userId = await createUser();
    // Five short runs bank 5,000; the sixth carries the day over 6,000.
    for (let i = 0; i < 5; i += 1) {
      const result = await submitRun(userId, run());
      assert.equal(result.reward.stars, 0);
    }

    const completing = await submitRun(userId, run());
    assert.equal(completing.reward.stepsToday, REWARD_RULES.dailyStepGoal);
    assert.equal(completing.reward.questPaid, true);
    assert.equal(completing.reward.stars, REWARD_RULES.starsPerQuest);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.starsBalance, REWARD_RULES.starsPerQuest);
    assert.equal(profile.starsEarnedToday, REWARD_RULES.starsPerQuest);
  });

  it('scales the star by the account shoe tier, from the server', async () => {
    const userId = await createUser();
    await setShoeTier(userId, 'gold');

    const result = await submitRun(userId, questRun());

    assert.equal(result.reward.shoeMultiplier, SHOES.gold.rewardMultiplier);
    assert.equal(result.reward.stars, SHOES.gold.rewardMultiplier);
    assert.equal((await getProfile(userId, DAY)).starsBalance, SHOES.gold.rewardMultiplier);
  });

  it('issues the free tier to a new account', async () => {
    const userId = await createUser();
    assert.equal((await getProfile(userId, DAY)).shoeTier, 'leather');
  });

  it('pays the quest once a day — later runs bank steps only', async () => {
    const userId = await createUser();
    await submitRun(userId, questRun());
    const second = await submitRun(userId, questRun());

    assert.equal(second.reward.questCompleted, true);
    assert.equal(second.reward.questPaid, false);
    assert.equal(second.reward.stars, 0);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.starsBalance, REWARD_RULES.starsPerQuest, 'one star, not two');
    assert.ok(profile.stepsToday > REWARD_RULES.dailyStepGoal, 'but the steps still banked');
  });

  it('holds the once-a-day rule against concurrent submissions', async () => {
    const userId = await createUser();

    // Ten quest-clearing runs at once. Without the row lock in submitRun each
    // would read "no star yet today" and each would pay one.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitRun(userId, questRun())),
    );

    const stars = results.reduce((sum, r) => sum + r.reward.stars, 0);
    assert.equal(stars, REWARD_RULES.starsPerQuest, 'exactly one quest paid, no more');
    assert.equal((await getProfile(userId, DAY)).starsBalance, REWARD_RULES.starsPerQuest);
  });

  /** Pedometer totals with no track behind them: `perSample` steps every `gapMs`, from `startMs`. */
  const walk = (samples: number, perSample = 50, gapMs = 25_000, startMs = 1_700_000_000_000) =>
    Array.from({ length: samples }, (_, i) => ({ timestamp: startMs + (i + 1) * gapMs, steps: (i + 1) * perSample }));

  it('credits only the raw samples, whatever else the client sends', async () => {
    const userId = await createUser();
    // The credited count, the distance and the stars are not part of SubmitRunInput at all, which is
    // the point: there is nowhere to put the lie. All that can be sent is the raw samples.
    const result = await submitRun(userId, run({ stepSamples: walk(20) }));

    assert.equal(result.reward.steps, 1000);
    assert.equal(result.reward.eligibleSteps, 1000);
    assert.equal((await getProfile(userId, DAY)).stepsToday, 1000);
  });

  it('counts steps with no GPS track at all', async () => {
    const userId = await createUser();
    const result = await submitRun(userId, run({ track: [], stepSamples: walk(20) }));

    assert.deepEqual(result.reward.flags, []);
    assert.equal(result.reward.distanceMetres, 0);
    assert.equal(result.reward.steps, 1000);
    assert.equal((await getProfile(userId, DAY)).stepsToday, 1000);
  });

  it('pays the quest to someone who walked in place, where GPS saw no movement', async () => {
    // The client's rule: users who walk in a small area must not be discouraged. The track never
    // moves, 6,000 steps are reported at a normal cadence, and the quest pays.
    const userId = await createUser();
    const track = stationaryTrack(QUEST_FIXES);
    const result = await submitRun(userId, run({ track, stepSamples: stepSamples(track, 50) }));

    assert.deepEqual(result.reward.flags, []);
    assert.equal(result.reward.distanceMetres, 0);
    assert.equal(result.reward.steps, REWARD_RULES.dailyStepGoal);
    assert.equal(result.reward.questPaid, true);
    assert.equal(result.reward.stars, REWARD_RULES.starsPerQuest);
    assert.equal((await getProfile(userId, DAY)).starsBalance, REWARD_RULES.starsPerQuest);
  });

  it('does not let GPS veto the steps: a track that looks like a drive still counts', async () => {
    // Documents a consequence of the client's rule, so nobody is surprised by it: GPS no longer
    // judges a run, so a vehicle-speed track does not zero steps the pedometer reported.
    const userId = await createUser();
    const track = drivingTrack(100);
    const result = await submitRun(userId, run({ track, stepSamples: stepSamples(track, 50) }));

    assert.deepEqual(result.reward.flags, []);
    assert.equal(result.reward.steps, 1000);
  });

  it('records a run that added nothing, with its reason, but writes no ledger entry', async () => {
    const userId = await createUser();
    const result = await submitRun(userId, run({ track: [], stepSamples: [] }));

    assert.deepEqual(result.reward.flags, ['no-steps']);
    const runs = await pool.query('SELECT flags FROM runs WHERE user_id = $1', [userId]);
    const ledger = await pool.query('SELECT 1 FROM star_ledger WHERE user_id = $1', [userId]);
    assert.equal(runs.rowCount, 1, 'the run is kept so the user can see why it added nothing');
    assert.deepEqual(runs.rows[0].flags, ['no-steps']);
    assert.equal(ledger.rowCount, 0, 'but nothing moved');
  });

  it('credits a resubmitted run exactly once', async () => {
    const userId = await createUser();
    const payload = questRun();

    const first = await submitRun(userId, payload);
    const second = await submitRun(userId, payload);

    assert.equal(first.id, second.id, 'the same run row comes back');
    assert.equal(second.reward.stars, first.reward.stars);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.starsBalance, first.reward.stars, 'credited once, not twice');
    assert.equal(profile.stepsToday, first.reward.eligibleSteps, 'and counted once');
  });

  it('cuts a total no person could have walked down to what the time allows', async () => {
    // The one bound left once GPS is out of it: cadence. A client reporting 100,000 steps a minute
    // after the run began is credited what a person could walk in that minute, not the claim.
    const start = 1_700_000_000_000;
    const userId = await createUser();
    const result = await submitRun(userId, {
      clientRunId: randomUUID(),
      startedAt: start,
      track: [],
      stepSamples: [{ timestamp: start + 60_000, steps: 100_000 }],
      day: DAY,
    });

    assert.equal(result.reward.steps, 300, '300 steps a minute is the ceiling');
    assert.equal(result.reward.questCompleted, false);
    assert.equal((await getProfile(userId, DAY)).starsBalance, 0);
  });

  it('bounds the first window by the run start too', async () => {
    const start = 1_700_000_000_000;
    const result = await submitRun(await createUser(), {
      clientRunId: randomUUID(),
      startedAt: start,
      track: [],
      stepSamples: [{ timestamp: start + 1000, steps: 500_000 }],
      day: DAY,
    });
    assert.equal(result.reward.steps, 5, 'one second of walking');
  });

  it('does not punish an honest count', async () => {
    const result = await submitRun(await createUser(), run({ track: [], stepSamples: walk(240) }));
    assert.equal(result.reward.steps, 240 * 50, 'a 120/min walk is far inside the ceiling');
  });

  it('banks nothing when the device sent no step samples at all', async () => {
    const userId = await createUser();
    // Built without the helper: the point of this case is the absent field,
    // the way a device with no pedometer uploads.
    const result = await submitRun(userId, {
      clientRunId: randomUUID(),
      startedAt: 1_700_000_000_000,
      track: goodTrack(100),
      day: DAY,
    });

    // The track is a valid 1.37 km. Steps are what the quest counts, so a run
    // that reports none adds nothing — distance alone is not payable.
    assert.deepEqual(result.reward.flags, ['no-steps']);
    assert.ok(result.reward.distanceMetres > 1000);
    assert.equal(result.reward.steps, 0);
    assert.equal(result.reward.stars, 0);
  });

  it('counts a streak only over consecutive completed days', async () => {
    const userId = await createUser();
    await submitRun(userId, questRun({ day: '2026-09-14' }));
    await submitRun(userId, questRun({ day: '2026-09-15' }));
    await submitRun(userId, questRun({ day: '2026-09-16' }));

    assert.equal((await getProfile(userId, '2026-09-16')).streakDays, 3);
  });

  it('breaks a streak on a missed day', async () => {
    const userId = await createUser();
    await submitRun(userId, questRun({ day: '2026-09-10' }));
    await submitRun(userId, questRun({ day: '2026-09-16' }));

    assert.equal((await getProfile(userId, '2026-09-16')).streakDays, 1);
  });

  it('does not count a day that banked steps but never completed', async () => {
    const userId = await createUser();
    await submitRun(userId, run({ day: '2026-09-15' }));
    await submitRun(userId, questRun({ day: '2026-09-16' }));

    assert.equal((await getProfile(userId, '2026-09-16')).streakDays, 1);
  });
});

describe('star exchange', () => {
  beforeEach(setupDb);

  const address = '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01';

  /** The ledger holds sparkles, so the fixture converts like the service does. */
  async function giveStars(userId: string, stars: number) {
    await pool.query(
      `INSERT INTO star_ledger (user_id, delta, reason, day, note)
       VALUES ($1, $2, 'adjustment', $3, 'test fixture')`,
      [userId, toSparkles(stars), DAY],
    );
  }

  it('stores a fraction of a star exactly', async () => {
    const userId = await createUser();
    await giveStars(userId, 0.35);
    await giveStars(userId, 0.05);
    assert.equal((await getProfile(userId, DAY)).starsBalance, 0.4);
  });

  it('debits stars and opens a pending exchange', async () => {
    const userId = await createUser();
    await giveStars(userId, 5);

    const { redemptionId, alli } = await openExchange({
      userId,
      stars: 2,
      toAddress: address,
      day: DAY,
    });

    assert.equal(alli, 2 * REWARD_RULES.alliPerStar);
    assert.equal((await getProfile(userId, DAY)).starsBalance, 3);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM redemptions WHERE id = $1',
      [redemptionId],
    );
    assert.equal(rows[0]!.status, 'pending');
  });

  it('refuses to exchange more stars than the balance', async () => {
    const userId = await createUser();
    await giveStars(userId, 1);

    await assert.rejects(
      () => openExchange({ userId, stars: 2, toAddress: address, day: DAY }),
      /do not have that many stars/i,
    );

    assert.equal((await getProfile(userId, DAY)).starsBalance, 1, 'balance untouched');
  });

  it('refuses a fractional or empty amount', async () => {
    const userId = await createUser();
    await giveStars(userId, 5);

    await assert.rejects(
      () => openExchange({ userId, stars: 1.5, toAddress: address, day: DAY }),
      /whole number/i,
    );
    await assert.rejects(
      () => openExchange({ userId, stars: 0, toAddress: address, day: DAY }),
      /whole number/i,
    );
  });

  it('returns the stars when settlement fails', async () => {
    const userId = await createUser();
    await giveStars(userId, 5);

    const { redemptionId } = await openExchange({
      userId,
      stars: 2,
      toAddress: address,
      day: DAY,
    });
    assert.equal((await getProfile(userId, DAY)).starsBalance, 3);

    await failExchange(redemptionId, 'relayer out of BNB');
    assert.equal((await getProfile(userId, DAY)).starsBalance, 5, 'stars came back');
  });

  it('does not refund twice if the failure handler runs again', async () => {
    const userId = await createUser();
    await giveStars(userId, 5);

    const { redemptionId } = await openExchange({
      userId,
      stars: 2,
      toAddress: address,
      day: DAY,
    });
    await failExchange(redemptionId, 'first failure');
    await failExchange(redemptionId, 'same failure, replayed');

    assert.equal((await getProfile(userId, DAY)).starsBalance, 5, 'refunded once');
  });
});
