import { averageSpeed } from './geo';
import { shoeMultiplier, type ShoeTier } from './shoes';
import type { RunSession, RewardBreakdown, RewardFlag } from './types';

/**
 * Reward rules.
 *
 * These constants are the tokenomics. They are duplicated on the backend, which
 * is authoritative: the client computes the same numbers only so the user sees a
 * result immediately. A client-side figure is a preview, never a credit — the
 * server re-runs this on the raw track before any ALLI moves. Never award from
 * the client alone; a value the phone can edit is a value the phone can mint.
 *
 * The reward is a **daily quest**, not a per-run payout: 6,000 GPS-verified
 * steps in a day, accumulated across however many runs it takes, pays once.
 * Distance is measured, shown in kilometres and used to validate — pace, stride
 * and the minimum below all run on it — but it is the evidence for the steps,
 * never the thing being paid.
 *
 * Stars are the reward unit; ALLI is the payout. What scales a day's stars is
 * the tier of NFT footwear the account holds (see `shoes.ts`), applied at the
 * moment the quest pays so that upgrading later cannot re-price stars already
 * earned.
 */
export const REWARD_RULES = {
  /** GPS-backed steps a day needs before the quest pays. */
  dailyStepGoal: 6_000,
  /** Stars the quest pays, before the shoe multiplier. */
  starsPerQuest: 1,
  /** ALLI one star exchanges for. */
  alliPerStar: 1_000,

  /**
   * Runs shorter than this earn nothing and contribute no steps — it stops
   * micro-run farming. Distance does not pay, but it still has to be there:
   * it is what vouches for the steps.
   */
  minDistanceMetres: 300,
  /**
   * Plausible human running/walking pace, in m/s.
   * 0.7 m/s ≈ 24 min/km (slow walk); 6.0 m/s ≈ 2:47 min/km (faster than a
   * world-class 10k, so almost certainly a vehicle).
   */
  minSpeedMps: 0.7,
  maxSpeedMps: 6.0,
  /** Fraction of fixes that may be rejected before the run is treated as untrusted. */
  maxRejectedFraction: 0.35,
  /**
   * A runner covers roughly 0.6–0.9 m per step. If GPS distance implies a much
   * longer stride than the pedometer supports, the phone was probably in a car.
   */
  maxMetresPerStep: 2.5,
} as const;

export type RewardContext = {
  /**
   * GPS-credited steps already banked today, from the server-side ledger. The
   * quest is a running total across the day, so a run is judged on where it
   * leaves that total, not on its own step count.
   */
  stepsToday: number;
  /**
   * Stars today's quest has already paid. Non-zero means the quest is done and
   * further runs today add steps but no stars.
   */
  starsEarnedToday?: number;
  /**
   * The NFT footwear tier the account holds. Comes from the backend so the
   * client cannot inflate it.
   */
  shoeTier?: ShoeTier;
  /** Fixes the track filter discarded — see `summarizeTrack`. */
  rejectedPoints?: number;
};

/**
 * Turns a finished run into its contribution to the daily quest. Pure: no
 * clock, no network, no storage — which is what lets the server run the
 * identical function on the raw track.
 *
 * `steps` must already be GPS-credited (`creditSteps` in `steps.ts`); a raw
 * pedometer count passed in here would let a shaken phone clear the quest from
 * an armchair. It is also the entire basis of the reward, so a device with no
 * pedometer earns nothing however far it walked — the run screen says so
 * rather than letting someone find out afterwards.
 */
export function calculateReward(
  session: Pick<RunSession, 'distanceMetres' | 'movingSeconds' | 'track' | 'steps'>,
  context: RewardContext,
): RewardBreakdown {
  const flags: RewardFlag[] = [];
  const { distanceMetres, movingSeconds, track, steps } = session;

  const rejected = context.rejectedPoints ?? 0;
  const totalPoints = track.length + rejected;
  if (totalPoints > 0 && rejected / totalPoints > REWARD_RULES.maxRejectedFraction) {
    flags.push('poor-gps');
  }

  if (distanceMetres < REWARD_RULES.minDistanceMetres) {
    flags.push('too-short');
  }

  const speed = averageSpeed(distanceMetres, movingSeconds);
  if (movingSeconds > 0) {
    if (speed > REWARD_RULES.maxSpeedMps) flags.push('pace-too-fast');
    else if (speed < REWARD_RULES.minSpeedMps) flags.push('pace-too-slow');
  }

  if (steps !== undefined && steps > 0 && distanceMetres / steps > REWARD_RULES.maxMetresPerStep) {
    flags.push('step-mismatch');
  }

  // Any validation flag zeroes the run — it adds nothing to the day's total.
  // Partial credit would give a cheat a dial to tune against, so the rule is
  // all-or-nothing.
  const clean = flags.length === 0;
  const creditedSteps = Math.max(0, Math.floor(steps ?? 0));
  const eligibleMetres = clean ? distanceMetres : 0;
  const eligibleSteps = clean ? creditedSteps : 0;

  const stepsBefore = Math.max(0, Math.floor(context.stepsToday));
  const stepsToday = stepsBefore + eligibleSteps;

  const alreadyPaid = (context.starsEarnedToday ?? 0) > 0;
  const questCompleted = stepsToday >= REWARD_RULES.dailyStepGoal;
  // Only the run that carries the day over the line pays. Later runs still
  // bank their steps — they count towards tomorrow's streak, not today's star.
  const questPaid = questCompleted && !alreadyPaid;

  const multiplier = shoeMultiplier(context.shoeTier);
  const baseStars = questPaid ? REWARD_RULES.starsPerQuest : 0;
  const stars = baseStars * multiplier;

  return {
    eligibleMetres,
    steps: creditedSteps,
    eligibleSteps,
    stepsToday,
    questGoal: REWARD_RULES.dailyStepGoal,
    questCompleted,
    questPaid,
    shoeMultiplier: multiplier,
    baseStars,
    stars,
    flags,
  };
}

/** Stars -> ALLI, at the fixed exchange rate. */
export function starsToAlli(stars: number): number {
  return stars * REWARD_RULES.alliPerStar;
}

/** Progress towards today's quest, clamped to 0–1, for a progress bar. */
export function questProgress(stepsToday: number): number {
  if (REWARD_RULES.dailyStepGoal <= 0) return 1;
  return Math.min(1, Math.max(0, stepsToday / REWARD_RULES.dailyStepGoal));
}

/** Steps still needed today. 0 once the quest is met. */
export function stepsToGo(stepsToday: number): number {
  return Math.max(0, REWARD_RULES.dailyStepGoal - Math.floor(stepsToday));
}

/** User-facing copy for a flag. Shown on the run summary so rejection is never silent. */
export function explainFlag(flag: RewardFlag): string {
  switch (flag) {
    case 'pace-too-fast':
      return 'Your average pace was faster than a person can run, so this run did not count towards the quest.';
    case 'pace-too-slow':
      return 'Your average pace was below walking speed, so this run did not count towards the quest.';
    case 'too-short':
      return `Runs under ${REWARD_RULES.minDistanceMetres} m do not count, however many steps they hold.`;
    case 'poor-gps':
      return 'Too many GPS readings were unusable. Try again with a clearer view of the sky.';
    case 'step-mismatch':
      return 'The distance did not match your step count, so this run did not count towards the quest.';
  }
}
