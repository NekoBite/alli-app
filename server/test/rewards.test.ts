import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, beforeEach, describe, it } from 'node:test';

import { pool } from '../src/db/pool.ts';
import { REWARD_RULES } from '../src/shared/jogging.ts';
import {
  getProfile,
  openRedemption,
  failRedemption,
  streakMultiplier,
  submitRun,
} from '../src/jogging/service.ts';
import { createUser, DAY, drivingTrack, goodTrack, setupDb } from './helpers.ts';

// File-scoped: closing the pool inside a suite would pull it out from under
// every suite that runs after it.
after(async () => pool.end());

describe('jogging rewards', () => {
  beforeEach(setupDb);

  const run = (over: Partial<Parameters<typeof submitRun>[1]> = {}) => ({
    clientRunId: randomUUID(),
    startedAt: 1_700_000_000_000,
    track: goodTrack(100),
    day: DAY,
    ...over,
  });

  it('awards points from the server-recomputed distance', async () => {
    const userId = await createUser();
    const result = await submitRun(userId, run());

    // 99 hops of ~13.9 m ≈ 1.37 km at 100 points/km.
    assert.equal(result.reward.flags.length, 0);
    assert.ok(result.reward.points > 100 && result.reward.points < 160);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, result.reward.points);
    assert.equal(profile.pointsEarnedToday, result.reward.points);
  });

  it('ignores whatever the client claims and trusts only the raw track', async () => {
    const userId = await createUser();
    // A malicious client sends a short track but lies in every other field.
    // Those fields are not part of SubmitRunInput at all, which is the point:
    // there is nowhere to put the lie.
    const result = await submitRun(userId, run({ track: goodTrack(4) }));

    assert.ok(result.reward.flags.includes('too-short'));
    assert.equal(result.reward.points, 0);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, 0);
  });

  it('rejects a run at vehicle speed', async () => {
    const userId = await createUser();
    const result = await submitRun(userId, run({ track: drivingTrack(100) }));

    assert.ok(result.reward.flags.includes('pace-too-fast'));
    assert.equal(result.reward.points, 0);
  });

  it('records a rejected run but writes no ledger entry', async () => {
    const userId = await createUser();
    await submitRun(userId, run({ track: drivingTrack(100) }));

    const runs = await pool.query('SELECT 1 FROM runs WHERE user_id = $1', [userId]);
    const ledger = await pool.query('SELECT 1 FROM points_ledger WHERE user_id = $1', [userId]);
    assert.equal(runs.rowCount, 1, 'the run is kept so the user can see why it failed');
    assert.equal(ledger.rowCount, 0, 'but nothing moved');
  });

  it('credits a resubmitted run exactly once', async () => {
    const userId = await createUser();
    const payload = run();

    const first = await submitRun(userId, payload);
    const second = await submitRun(userId, payload);

    assert.equal(first.id, second.id, 'the same run row comes back');
    assert.equal(second.reward.points, first.reward.points);

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, first.reward.points, 'credited once, not twice');
  });

  it('holds the daily cap against concurrent submissions', async () => {
    const userId = await createUser();

    // Ten long runs at once. Without the row lock in submitRun each would read
    // "0 earned today" and award a full run's worth, blowing past the cap.
    const results = await Promise.all(
      Array.from({ length: 10 }, () => submitRun(userId, run({ track: goodTrack(900) }))),
    );

    const total = results.reduce((sum, r) => sum + r.reward.points, 0);
    assert.equal(total, REWARD_RULES.dailyPointsCap, 'exactly the cap, no more');

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, REWARD_RULES.dailyPointsCap);
    assert.ok(
      results.some((r) => r.reward.flags.includes('daily-cap-reached')),
      'and the user is told why',
    );
  });

  it('counts a streak only over consecutive days', async () => {
    const userId = await createUser();
    await submitRun(userId, run({ day: '2026-09-14' }));
    await submitRun(userId, run({ day: '2026-09-15' }));
    await submitRun(userId, run({ day: '2026-09-16' }));

    const profile = await getProfile(userId, '2026-09-16');
    assert.equal(profile.streakDays, 3);
    assert.equal(profile.multiplier, streakMultiplier(3));
  });

  it('breaks a streak on a missed day', async () => {
    const userId = await createUser();
    await submitRun(userId, run({ day: '2026-09-10' }));
    await submitRun(userId, run({ day: '2026-09-16' }));

    const profile = await getProfile(userId, '2026-09-16');
    assert.equal(profile.streakDays, 1);
  });
});

describe('redemption', () => {
  beforeEach(setupDb);

  const address = '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01';

  async function givePoints(userId: string, points: number) {
    await pool.query(
      `INSERT INTO points_ledger (user_id, delta, reason, day, note)
       VALUES ($1, $2, 'adjustment', $3, 'test fixture')`,
      [userId, points, DAY],
    );
  }

  it('debits points and opens a pending redemption', async () => {
    const userId = await createUser();
    await givePoints(userId, 5000);

    const { redemptionId, alli } = await openRedemption({
      userId,
      points: 2000,
      toAddress: address,
      day: DAY,
    });

    assert.equal(alli, 2);
    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, 3000);

    const { rows } = await pool.query<{ status: string }>(
      'SELECT status FROM redemptions WHERE id = $1',
      [redemptionId],
    );
    assert.equal(rows[0]!.status, 'pending');
  });

  it('refuses to redeem more points than the balance', async () => {
    const userId = await createUser();
    await givePoints(userId, 1000);

    await assert.rejects(
      () => openRedemption({ userId, points: 2000, toAddress: address, day: DAY }),
      /do not have that many points/i,
    );

    const profile = await getProfile(userId, DAY);
    assert.equal(profile.pointsBalance, 1000, 'balance untouched by the failed attempt');
  });

  it('refuses an amount that is not a whole ALLI', async () => {
    const userId = await createUser();
    await givePoints(userId, 5000);

    await assert.rejects(
      () => openRedemption({ userId, points: 1500, toAddress: address, day: DAY }),
      /multiples of/i,
    );
  });

  it('returns the points when settlement fails', async () => {
    const userId = await createUser();
    await givePoints(userId, 5000);

    const { redemptionId } = await openRedemption({
      userId,
      points: 2000,
      toAddress: address,
      day: DAY,
    });
    assert.equal((await getProfile(userId, DAY)).pointsBalance, 3000);

    await failRedemption(redemptionId, 'rpc timeout');

    assert.equal((await getProfile(userId, DAY)).pointsBalance, 5000, 'points returned in full');
    const { rows } = await pool.query<{ status: string; failure: string }>(
      'SELECT status, failure FROM redemptions WHERE id = $1',
      [redemptionId],
    );
    assert.equal(rows[0]!.status, 'failed');
    assert.equal(rows[0]!.failure, 'rpc timeout');
  });

  it('does not refund twice if the failure handler runs again', async () => {
    const userId = await createUser();
    await givePoints(userId, 5000);

    const { redemptionId } = await openRedemption({
      userId,
      points: 2000,
      toAddress: address,
      day: DAY,
    });
    await failRedemption(redemptionId, 'rpc timeout');
    await failRedemption(redemptionId, 'rpc timeout');

    assert.equal((await getProfile(userId, DAY)).pointsBalance, 5000, 'refunded once');
  });
});
