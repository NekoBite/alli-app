import { calculateReward, pointsToAlli, REWARD_RULES, starsToAlli } from './rewards';
import type { GeoPoint } from './types';

/** Minimal track — only its length matters to the GPS-quality check. */
function track(points: number): GeoPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: 13.7563 + i * 0.0001,
    longitude: 100.5018,
    timestamp: 1_700_000_000_000 + i * 1000,
    accuracy: 8,
  }));
}

/**
 * A plausible outing: 2.5 m/s over a 0.8 m stride, which is what the pace and
 * stride checks are looking for. Steps are the reward basis, so they are what
 * each case varies.
 */
function run(steps: number, over = { metresPerStep: 0.8, speedMps: 2.5 }) {
  const distanceMetres = steps * over.metresPerStep;
  return {
    distanceMetres,
    movingSeconds: distanceMetres / over.speedMps,
    track: track(Math.max(2, Math.round(steps / 50))),
    steps,
  };
}

const clean = { pointsEarnedToday: 0 };

describe('calculateReward', () => {
  it('pays pointsPerThousandSteps for a clean run', () => {
    const reward = calculateReward(run(5000), clean);

    expect(reward.flags).toEqual([]);
    expect(reward.eligibleSteps).toBe(5000);
    expect(reward.points).toBe(500);
    expect(pointsToAlli(reward.points)).toBe(0.5);
  });

  it('pays for the steps, not the ground covered', () => {
    // Same 4 km, twice the steps: twice the points. Distance is the witness,
    // not the reward.
    const short = calculateReward(run(5000, { metresPerStep: 0.8, speedMps: 2.5 }), clean);
    const longer = calculateReward(run(10_000, { metresPerStep: 0.4, speedMps: 2.5 }), clean);

    expect(longer.eligibleMetres).toBe(short.eligibleMetres);
    expect(longer.points).toBe(short.points * 2);
  });

  it('pays nothing for distance with no steps behind it', () => {
    // A device with no pedometer, or GPS moving with nobody walking.
    const reward = calculateReward(
      { distanceMetres: 5000, movingSeconds: 2000, track: track(100) },
      clean,
    );

    expect(reward.flags).toEqual([]);
    expect(reward.eligibleMetres).toBe(5000);
    expect(reward.eligibleSteps).toBe(0);
    expect(reward.points).toBe(0);
  });

  it('rejects a run faster than a human can move', () => {
    const reward = calculateReward(run(5000, { metresPerStep: 0.8, speedMps: 16 }), clean);

    expect(reward.flags).toContain('pace-too-fast');
    expect(reward.points).toBe(0);
  });

  it('rejects a run below the minimum distance', () => {
    const reward = calculateReward(run(200, { metresPerStep: 0.6, speedMps: 1.5 }), clean);

    expect(reward.flags).toContain('too-short');
    expect(reward.points).toBe(0);
  });

  it('flags a track where most fixes were discarded', () => {
    const reward = calculateReward(run(4000), { ...clean, rejectedPoints: 400 });

    expect(reward.flags).toContain('poor-gps');
    expect(reward.points).toBe(0);
  });

  it('flags an impossible stride length', () => {
    // 5 km on 500 steps = 10 m per step.
    const reward = calculateReward(run(500, { metresPerStep: 10, speedMps: 3 }), clean);

    expect(reward.flags).toContain('step-mismatch');
    expect(reward.points).toBe(0);
  });

  it('clamps to the daily cap and says so', () => {
    const reward = calculateReward(run(10_000), {
      pointsEarnedToday: REWARD_RULES.dailyPointsCap - 100,
    });

    expect(reward.grossPoints).toBe(1000);
    expect(reward.points).toBe(100);
    expect(reward.flags).toContain('daily-cap-reached');
  });

  it('applies the server-supplied multiplier', () => {
    const reward = calculateReward(run(3000), { pointsEarnedToday: 0, multiplier: 1.5 });

    expect(reward.points).toBe(450);
  });
});

describe('stars', () => {
  /**
   * 400 m in 160 s is 2.5 m/s, and 400 m over 200 steps is a 2 m stride — both
   * inside the rules, so only the goal itself is under test.
   */
  const complete = {
    distanceMetres: 400,
    movingSeconds: 160,
    track: track(40),
    steps: REWARD_RULES.stepGoal,
  };

  it('pays a star for a clean run that reaches the step goal', () => {
    const reward = calculateReward(complete, clean);

    expect(reward.flags).toEqual([]);
    expect(reward.goalReached).toBe(true);
    expect(reward.stars).toBe(REWARD_RULES.starsPerCompletedRun);
    expect(starsToAlli(reward.stars)).toBe(REWARD_RULES.alliPerStar);
  });

  it('pays no star below the step goal, but still pays those steps', () => {
    const reward = calculateReward({ ...complete, steps: REWARD_RULES.stepGoal - 1 }, clean);

    expect(reward.goalReached).toBe(false);
    expect(reward.stars).toBe(0);
    expect(reward.points).toBe(19);
  });

  it('pays no star when the run was flagged', () => {
    // 400 m in 30 s: fast enough to be a vehicle.
    const reward = calculateReward({ ...complete, movingSeconds: 30 }, clean);

    expect(reward.flags).toContain('pace-too-fast');
    expect(reward.stars).toBe(0);
  });

  it('still pays the star when only the daily point cap was hit', () => {
    // Stars are bounded by run credits, points by the daily cap. Hitting one
    // must not cost the other.
    const reward = calculateReward(complete, {
      pointsEarnedToday: REWARD_RULES.dailyPointsCap,
    });

    expect(reward.flags).toEqual(['daily-cap-reached']);
    expect(reward.points).toBe(0);
    expect(reward.stars).toBe(REWARD_RULES.starsPerCompletedRun);
  });

  it('pays no star when the device reported no steps at all', () => {
    const reward = calculateReward({ ...complete, steps: undefined }, clean);

    expect(reward.steps).toBe(0);
    expect(reward.stars).toBe(0);
  });
});
