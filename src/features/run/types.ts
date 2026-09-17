export type GeoPoint = {
  latitude: number;
  longitude: number;
  /** ms since epoch. */
  timestamp: number;
  /** Horizontal accuracy in metres, as reported by the OS. */
  accuracy?: number;
  /** m/s, from the OS where available. */
  speed?: number;
  altitude?: number;
};

export type RunStatus = 'idle' | 'running' | 'paused' | 'finished';

/**
 * The pedometer's running total for the run, at a moment in time.
 *
 * Samples rather than one figure because a total on its own cannot be checked:
 * paired with the track, each one says how far the phone moved while those
 * steps were taken, which is what makes a shaken phone worth nothing. See
 * `creditStepSamples`.
 */
export type StepSample = {
  /** ms since epoch. */
  timestamp: number;
  /** Steps reported since the run started — non-decreasing. */
  steps: number;
};

export type RunSession = {
  id: string;
  startedAt: number;
  endedAt?: number;
  /** Accepted GPS fixes, already filtered for accuracy. */
  track: GeoPoint[];
  /** Metres, summed from accepted points only. */
  distanceMetres: number;
  /** Seconds of movement — paused and stationary time excluded. */
  movingSeconds: number;
  /**
   * Steps the pedometer reported *and* GPS movement backed — see `steps.ts`.
   * Used to cross-check GPS distance and to decide whether the run completed.
   * A preview, like `distanceMetres`: the server re-credits from `stepSamples`.
   */
  steps?: number;
  /** Raw pedometer totals over the run, for the server to re-credit. */
  stepSamples?: StepSample[];
};

/** Why a run was rejected or trimmed. Surfaced to the user verbatim. */
export type RewardFlag =
  | 'pace-too-fast'
  | 'pace-too-slow'
  | 'too-short'
  | 'poor-gps'
  | 'daily-cap-reached'
  | 'step-mismatch';

export type RewardBreakdown = {
  /** Distance that passed validation, in metres. Measured and shown, never paid. */
  eligibleMetres: number;
  /** Credited steps that passed validation — the basis of `basePoints`. */
  eligibleSteps: number;
  basePoints: number;
  /** Multiplier from streaks, events, or a planted-tree bonus. */
  multiplier: number;
  /** Points before the daily cap. */
  grossPoints: number;
  /** Points actually awarded, after the cap. */
  points: number;
  /** GPS-backed steps the run was credited with. */
  steps: number;
  /** True once those steps clear the step goal — what makes a run "complete". */
  goalReached: boolean;
  /** Stars awarded. A completed, unflagged run pays `starsPerCompletedRun`. */
  stars: number;
  flags: RewardFlag[];
};

export type RunSummary = RunSession & {
  reward: RewardBreakdown;
  /** Server-confirmed. Until the backend validates, this stays false. */
  confirmed: boolean;
};

/**
 * The monthly subscription that tops up run credits.
 *
 * Credits it granted do not expire with it: an expired membership stops the
 * monthly top-up, it does not take back runs the account already holds.
 */
export type Membership = {
  status: 'active' | 'expired' | 'none';
  /** ms since epoch. Absent when the account never had one. */
  activeUntil?: number;
  /** Run credits granted by each renewal. */
  runsPerRenewal: number;
  priceUsdt: number;
};

/**
 * What the account may do right now — the run-credit balance, stars held, and
 * the membership that tops the credits up.
 *
 * Every counter here is the server's: the month and day buckets are cut with
 * the server clock, which is why `serverTime` travels with them. A phone whose
 * clock says it is next month must not get a fresh purchase allowance.
 */
export type RunEntitlement = {
  /** Run credits left. Bought and granted credits are one pool, and never expire. */
  runsLeft: number;
  /** Runs submitted this server month. */
  runsThisMonth: number;
  /** Extra credits bought this server month — capped, see `credits.ts`. */
  extraRunsBoughtThisMonth: number;
  /** Stars held, exchangeable for ALLI. */
  stars: number;
  /** Stars earned today, on the server's day. */
  starsToday: number;
  membership: Membership;
  /** Server clock in ms since epoch, sampled when the entitlement was read. */
  serverTime: number;
};
