import { calculateReward, questProgress, REWARD_RULES, starsToAlli, stepsToGo } from './rewards';
import { SHOES } from './shoes';
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
 * stride checks are looking for. Steps are what the quest counts, so they are
 * what each case varies.
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

/** A fresh day: nothing banked, nothing paid, the free shoe tier. */
const freshDay = { stepsToday: 0 };

const GOAL = REWARD_RULES.dailyStepGoal;

describe('calculateReward — the daily quest', () => {
  it('banks steps without paying until the day crosses the goal', () => {
    const reward = calculateReward(run(2000), freshDay);

    expect(reward.flags).toEqual([]);
    expect(reward.eligibleSteps).toBe(2000);
    expect(reward.stepsToday).toBe(2000);
    expect(reward.questCompleted).toBe(false);
    expect(reward.stars).toBe(0);
  });

  it('counts the day, not the run — a second run can complete the quest', () => {
    const reward = calculateReward(run(2000), { stepsToday: GOAL - 2000 });

    expect(reward.stepsToday).toBe(GOAL);
    expect(reward.questCompleted).toBe(true);
    expect(reward.questPaid).toBe(true);
    expect(reward.stars).toBe(REWARD_RULES.starsPerQuest);
  });

  it('pays once a day — later runs bank steps and nothing else', () => {
    const reward = calculateReward(run(2000), {
      stepsToday: GOAL,
      starsEarnedToday: REWARD_RULES.starsPerQuest,
    });

    expect(reward.questCompleted).toBe(true);
    expect(reward.questPaid).toBe(false);
    expect(reward.stars).toBe(0);
    expect(reward.stepsToday).toBe(GOAL + 2000);
  });

  it('scales the reward by the shoe tier, at the moment it pays', () => {
    const forTier = (shoeTier: 'leather' | 'silver' | 'gold') =>
      calculateReward(run(GOAL), { stepsToday: 0, shoeTier });

    expect(forTier('leather').stars).toBe(SHOES.leather.rewardMultiplier);
    expect(forTier('silver').stars).toBe(SHOES.silver.rewardMultiplier);
    expect(forTier('gold').stars).toBe(SHOES.gold.rewardMultiplier);
    expect(forTier('gold').shoeMultiplier).toBe(5);
    expect(starsToAlli(forTier('gold').stars)).toBe(5 * REWARD_RULES.alliPerStar);
  });

  it('treats an unknown tier as the free one rather than throwing', () => {
    expect(calculateReward(run(GOAL), freshDay).shoeMultiplier).toBe(1);
  });

  it('adds nothing to the day when the run is flagged', () => {
    const reward = calculateReward(run(GOAL, { metresPerStep: 0.8, speedMps: 16 }), {
      stepsToday: 1000,
    });

    expect(reward.flags).toContain('pace-too-fast');
    expect(reward.eligibleSteps).toBe(0);
    expect(reward.stepsToday).toBe(1000);
    expect(reward.stars).toBe(0);
  });

  it('adds nothing for distance with no steps behind it', () => {
    // A device with no pedometer, or GPS moving with nobody walking.
    const reward = calculateReward(
      { distanceMetres: 5000, movingSeconds: 2000, track: track(100) },
      freshDay,
    );

    expect(reward.flags).toEqual([]);
    expect(reward.eligibleMetres).toBe(5000);
    expect(reward.eligibleSteps).toBe(0);
    expect(reward.stars).toBe(0);
  });

  it('rejects a run faster than a human can move', () => {
    const reward = calculateReward(run(5000, { metresPerStep: 0.8, speedMps: 16 }), freshDay);

    expect(reward.flags).toContain('pace-too-fast');
    expect(reward.eligibleSteps).toBe(0);
  });

  it('rejects a run below the minimum distance', () => {
    const reward = calculateReward(run(200, { metresPerStep: 0.6, speedMps: 1.5 }), freshDay);

    expect(reward.flags).toContain('too-short');
    expect(reward.eligibleSteps).toBe(0);
  });

  it('flags a track where most fixes were discarded', () => {
    const reward = calculateReward(run(4000), { ...freshDay, rejectedPoints: 400 });

    expect(reward.flags).toContain('poor-gps');
    expect(reward.eligibleSteps).toBe(0);
  });

  it('flags an impossible stride length', () => {
    // 5 km on 500 steps = 10 m per step.
    const reward = calculateReward(run(500, { metresPerStep: 10, speedMps: 3 }), freshDay);

    expect(reward.flags).toContain('step-mismatch');
    expect(reward.eligibleSteps).toBe(0);
  });
});

describe('questProgress', () => {
  it('reports a fraction of the daily goal', () => {
    expect(questProgress(GOAL / 2)).toBe(0.5);
  });

  it('clamps past the goal and below zero', () => {
    expect(questProgress(GOAL * 3)).toBe(1);
    expect(questProgress(-10)).toBe(0);
  });
});

describe('stepsToGo', () => {
  it('counts down to the goal', () => {
    expect(stepsToGo(GOAL - 250)).toBe(250);
  });

  it('is zero once the quest is met', () => {
    expect(stepsToGo(GOAL + 5000)).toBe(0);
  });
});
