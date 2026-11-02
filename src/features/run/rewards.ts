import { shoeMultiplier, type ShoeTier } from './shoes';
import type { RewardBreakdown, RewardFlag, RunSession } from './types';

/**
 * Reward rules.
 *
 * These constants are the tokenomics. They are duplicated on the backend, which
 * is authoritative: the client computes the same numbers only so the user sees a
 * result immediately. A client-side figure is a preview, never a credit — the
 * server re-runs this on the raw track before any ALLI moves. Never award from
 * the client alone; a value the phone can edit is a value the phone can mint.
 *
 * The reward is a **daily quest**, not a per-run payout: 6,000 steps in a day,
 * accumulated across however many runs it takes, pays once. Steps are what the
 * pedometer reports (see `steps.ts`); GPS distance is measured and shown but
 * plays no part in what is paid, so a walk round a room counts like any other.
 *
 * Stars are the reward unit; ALLI is the payout. What scales a day's stars is
 * the tier of NFT footwear the account holds (see `shoes.ts`), applied at the
 * moment the quest pays so that upgrading later cannot re-price stars already
 * earned.
 */
export const REWARD_RULES = {
  /** Steps a day needs before the quest pays. */
  dailyStepGoal: 6_000,
  /** Stars the quest pays, before the shoe multiplier. */
  starsPerQuest: 1,
  /** ALLI one star exchanges for. */
  alliPerStar: 1_000,
  /**
   * The ledger's unit. A star is worth 1,000 ALLI, which is too coarse for a
   * garden that pays a fraction of a star a day, so the ledger counts in
   * sparkles and a star is a hundred of them. Stars stay the unit everywhere
   * a person sees a number; sparkles only exist where a whole number is stored.
   */
  sparklesPerStar: 100,
} as const;

export type RewardContext = {
  /**
   * Steps already banked today, from the server-side ledger. The
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
};

/**
 * Turns a finished run into its contribution to the daily quest. Pure: no
 * clock, no network, no storage — which is what lets the server run the
 * identical function.
 *
 * `steps` must already be credited (`creditStepSamples`), never a raw figure a
 * client typed. It is the entire basis of the reward, so a device with no
 * pedometer earns nothing however far it walked; the run screen says so rather
 * than letting someone find out afterwards.
 *
 * Distance is carried through for display only. Nothing about it can zero a
 * run: a person walking in a corridor has a distance of nearly nothing and has
 * still walked.
 */
export function calculateReward(
  session: Pick<RunSession, 'distanceMetres' | 'steps'>,
  context: RewardContext,
): RewardBreakdown {
  const flags: RewardFlag[] = [];
  const creditedSteps = Math.max(0, Math.floor(session.steps ?? 0));
  if (creditedSteps === 0) flags.push('no-steps');

  const stepsBefore = Math.max(0, Math.floor(context.stepsToday));
  const stepsToday = stepsBefore + creditedSteps;

  const alreadyPaid = (context.starsEarnedToday ?? 0) > 0;
  const questCompleted = stepsToday >= REWARD_RULES.dailyStepGoal;
  // Only the run that carries the day over the line pays. Later runs still
  // bank their steps — they count towards tomorrow's streak, not today's star.
  const questPaid = questCompleted && !alreadyPaid;

  const multiplier = shoeMultiplier(context.shoeTier);
  const baseStars = questPaid ? REWARD_RULES.starsPerQuest : 0;
  const stars = baseStars * multiplier;

  return {
    distanceMetres: Math.max(0, session.distanceMetres),
    steps: creditedSteps,
    eligibleSteps: creditedSteps,
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

/** Stars -> whole sparkles, the unit the ledger stores. */
export function toSparkles(stars: number): number {
  return Math.round(stars * REWARD_RULES.sparklesPerStar);
}

/** Whole sparkles -> stars, for display and for the exchange rate. */
export function fromSparkles(sparkles: number): number {
  return sparkles / REWARD_RULES.sparklesPerStar;
}

/**
 * Stars rounded to the ledger's precision. Anything that pays or prices in
 * stars goes through here so a preview never shows a fraction the ledger
 * cannot hold.
 */
export function roundStars(stars: number): number {
  return fromSparkles(toSparkles(stars));
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

/** User-facing copy for a flag. Shown on the run summary so a run that added nothing is never silent. */
export function explainFlag(flag: RewardFlag): string {
  switch (flag) {
    case 'no-steps':
      return 'No steps were counted for this run, so it added nothing to today’s quest. Check that motion and fitness access is allowed.';
  }
}
