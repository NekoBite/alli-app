import { calculateReward, explainFlag, questProgress, REWARD_RULES, starsToAlli, stepsToGo } from './rewards';
import { SHOES } from './shoes';

/**
 * A run is its credited steps and the distance GPS happened to measure. Steps are what the quest
 * counts, so they are what each case varies; distance is carried through for display and, as one
 * test below insists, can never change the outcome.
 */
function run(steps: number, distanceMetres = steps * 0.8) {
  return { distanceMetres, steps };
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
});

describe('calculateReward — GPS plays no part', () => {
  it('pays the same for the same steps at any distance, including none', () => {
    // Walking round a room, on a treadmill, or somewhere GPS cannot follow: the distance is
    // nothing, and so is its effect. This is the property the client asked for.
    const outcomes = [0, 1, 50, 5_000, 80_000].map((distance) => {
      const reward = calculateReward(run(GOAL, distance), freshDay);
      return [reward.flags, reward.eligibleSteps, reward.questPaid, reward.stars];
    });
    for (const outcome of outcomes) expect(outcome).toEqual([[], GOAL, true, REWARD_RULES.starsPerQuest]);
  });

  it('carries the measured distance through for display, and never negative', () => {
    expect(calculateReward(run(1000, 2345), freshDay).distanceMetres).toBe(2345);
    expect(calculateReward(run(1000, -5), freshDay).distanceMetres).toBe(0);
  });

  it('adds nothing for distance with no steps behind it, and says why', () => {
    // A device with no pedometer, or GPS moving with nobody walking.
    const reward = calculateReward({ distanceMetres: 5000, steps: undefined }, freshDay);

    expect(reward.flags).toEqual(['no-steps']);
    expect(reward.distanceMetres).toBe(5000);
    expect(reward.eligibleSteps).toBe(0);
    expect(reward.stars).toBe(0);
    expect(explainFlag('no-steps')).toMatch(/no steps/i);
  });

  it('floors fractional steps and ignores negative ones', () => {
    expect(calculateReward(run(10.9), freshDay).eligibleSteps).toBe(10);
    expect(calculateReward(run(-3), freshDay).eligibleSteps).toBe(0);
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
