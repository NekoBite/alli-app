import { averageSpeed } from './geo';
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
 * Two currencies come out of one run, and they are bounded differently:
 *
 * - **Points** accrue per validated kilometre and are bounded by a daily cap.
 * - **Stars** are paid once per *completed* run, and are bounded by run
 *   credits, which are bought (see `credits.ts`). One star is worth far more
 *   ALLI than a day of points; that is only coherent because a star costs a run
 *   credit and a run credit costs USDT. See docs/architecture.md §4 — neither
 *   number is a balanced economy yet.
 */
export const REWARD_RULES = {
  /** Points per kilometre of validated distance. */
  pointsPerKm: 100,
  /** Runs shorter than this earn nothing — stops micro-run farming. */
  minDistanceMetres: 300,
  /**
   * Plausible human running/walking pace, in m/s.
   * 0.7 m/s ≈ 24 min/km (slow walk); 6.0 m/s ≈ 2:47 min/km (faster than a
   * world-class 10k, so almost certainly a vehicle).
   */
  minSpeedMps: 0.7,
  maxSpeedMps: 6.0,
  /** Points a single account can earn per calendar day. */
  dailyPointsCap: 1_000,
  /** Fraction of fixes that may be rejected before the run is treated as untrusted. */
  maxRejectedFraction: 0.35,
  /**
   * A runner covers roughly 0.6–0.9 m per step. If GPS distance implies a much
   * longer stride than the pedometer supports, the phone was probably in a car.
   */
  maxMetresPerStep: 2.5,
  /** Points required for one ALLI. */
  pointsPerAlli: 1_000,

  /**
   * GPS-backed steps that complete a run. Below this the run still earns
   * points for the distance it covered, but pays no star.
   *
   * 200 steps is around 150 m, so in practice `minDistanceMetres` binds first:
   * a run has to be clean *and* long enough to pass validation before the goal
   * can pay anything.
   */
  stepGoal: 200,
  /** Stars paid by one completed run. */
  starsPerCompletedRun: 1,
  /** ALLI one star exchanges for. */
  alliPerStar: 1_000,
} as const;

export type RewardContext = {
  /** Points already earned today, from the server-side ledger. */
  pointsEarnedToday: number;
  /**
   * Multiplier from streaks, events and planted trees. Comes from the backend so
   * the client cannot inflate it. 1 = no bonus.
   */
  multiplier?: number;
  /** Fixes the track filter discarded — see `summarizeTrack`. */
  rejectedPoints?: number;
};

/**
 * Turns a finished run into points and stars. Pure: no clock, no network, no
 * storage — which is what lets the server run the identical function on the raw
 * track.
 *
 * `steps` must already be GPS-credited (`creditSteps` in `steps.ts`); a raw
 * pedometer count passed in here would let a shaken phone complete a run.
 */
export function calculateReward(
  session: Pick<RunSession, 'distanceMetres' | 'movingSeconds' | 'track' | 'steps'>,
  context: RewardContext,
): RewardBreakdown {
  const flags: RewardFlag[] = [];
  const { distanceMetres, movingSeconds, track, steps } = session;
  const multiplier = context.multiplier ?? 1;

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

  // Any validation flag zeroes the run. Partial credit would give a cheat a
  // dial to tune against, so the rule is all-or-nothing.
  const eligibleMetres = flags.length === 0 ? distanceMetres : 0;
  const basePoints = (eligibleMetres / 1000) * REWARD_RULES.pointsPerKm;
  const grossPoints = Math.floor(basePoints * multiplier);

  const remainingToday = Math.max(0, REWARD_RULES.dailyPointsCap - context.pointsEarnedToday);
  const points = Math.min(grossPoints, remainingToday);
  if (grossPoints > points) flags.push('daily-cap-reached');

  // The star is the completion reward: the step goal has to be met *and* the
  // run has to be clean. Hitting the daily point cap does not cost the star —
  // the cap bounds points, and stars are bounded by run credits instead.
  const creditedSteps = Math.max(0, Math.floor(steps ?? 0));
  const blocking = flags.filter((flag) => flag !== 'daily-cap-reached');
  const goalReached = creditedSteps >= REWARD_RULES.stepGoal;
  const stars = goalReached && blocking.length === 0 ? REWARD_RULES.starsPerCompletedRun : 0;

  return {
    eligibleMetres,
    basePoints,
    multiplier,
    grossPoints,
    points,
    steps: creditedSteps,
    goalReached,
    stars,
    flags,
  };
}

/** Points -> ALLI, at the fixed conversion rate. */
export function pointsToAlli(points: number): number {
  return points / REWARD_RULES.pointsPerAlli;
}

export function alliToPoints(alli: number): number {
  return Math.ceil(alli * REWARD_RULES.pointsPerAlli);
}

/** Stars -> ALLI, at the fixed exchange rate. */
export function starsToAlli(stars: number): number {
  return stars * REWARD_RULES.alliPerStar;
}

/** User-facing copy for a flag. Shown on the run summary so rejection is never silent. */
export function explainFlag(flag: RewardFlag): string {
  switch (flag) {
    case 'pace-too-fast':
      return 'Your average pace was faster than a person can run, so this run was not counted.';
    case 'pace-too-slow':
      return 'Your average pace was below walking speed, so this run was not counted.';
    case 'too-short':
      return `Runs under ${REWARD_RULES.minDistanceMetres} m do not earn points.`;
    case 'poor-gps':
      return 'Too many GPS readings were unusable. Try again with a clearer view of the sky.';
    case 'daily-cap-reached':
      return `You have hit today's ${REWARD_RULES.dailyPointsCap.toLocaleString()} point cap. It resets at midnight.`;
    case 'step-mismatch':
      return 'The distance did not match your step count, so this run was not counted.';
  }
}
