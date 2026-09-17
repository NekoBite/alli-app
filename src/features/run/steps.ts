import { summarizeTrack } from './geo';
import type { GeoPoint, StepSample } from './types';

/**
 * Step credit.
 *
 * The pedometer is the easiest sensor on the phone to fake: shaking it in a
 * chair produces a clean step count. So steps are only credited where GPS
 * movement over the same span backs them up, window by window, and a window
 * can never credit more steps than its distance could physically hold.
 *
 * Pure, like `geo.ts` and `rewards.ts`, so the server can re-run it on the raw
 * windows and reach the same number the phone showed.
 */

export const STEP_RULES = {
  /**
   * Shortest stride that will be credited. A window's steps are capped at
   * `metres / minMetresPerStep`, so a metre of ground cannot yield ten steps.
   * Well below a real running stride (0.6–0.9 m) on purpose: this is a floor
   * against fabrication, not a fitness measurement.
   */
  minMetresPerStep: 0.3,
  /**
   * A window that moved less than this credits nothing. This is the rule that
   * makes shaking the phone worthless.
   */
  minWindowMetres: 1,
} as const;

/** One pedometer reading, paired with the GPS distance covered alongside it. */
export type StepWindow = {
  /** Steps the pedometer reported since the previous window. */
  steps: number;
  /** Metres of accepted GPS movement over the same span. */
  metres: number;
};

export type StepCredit = {
  /** Steps that counted. */
  steps: number;
  /** Steps the rules threw away — shown to the user so a low count is explainable. */
  dropped: number;
};

/** Credits one pedometer window against the ground it covered. */
export function creditStepWindow(window: StepWindow): StepCredit {
  const reported = Math.max(0, Math.floor(window.steps));
  if (reported === 0) return { steps: 0, dropped: 0 };

  if (!Number.isFinite(window.metres) || window.metres < STEP_RULES.minWindowMetres) {
    return { steps: 0, dropped: reported };
  }

  const supported = Math.floor(window.metres / STEP_RULES.minMetresPerStep);
  const steps = Math.min(reported, supported);
  return { steps, dropped: reported - steps };
}

/** Sums `creditStepWindow` over a whole run. */
export function creditSteps(windows: StepWindow[]): StepCredit {
  return windows.reduce<StepCredit>(
    (total, window) => {
      const credit = creditStepWindow(window);
      return { steps: total.steps + credit.steps, dropped: total.dropped + credit.dropped };
    },
    { steps: 0, dropped: 0 },
  );
}

/**
 * Re-credits a whole run from what the sensors actually reported: the raw
 * track, and the pedometer's running total at points in time.
 *
 * This is the server's version of the live count the run screen shows. It takes
 * no credited number from the phone — the samples are paired with the ground
 * covered between them and run through the same window rule, so a client that
 * uploads a million steps against a track that never moved credits none of them.
 *
 * Each window keeps the last fix of the previous one as its starting point, so
 * the hop across a window boundary is counted once, in the window it ends in.
 */
export function creditStepSamples(track: GeoPoint[], samples: StepSample[]): StepCredit {
  if (samples.length === 0) return { steps: 0, dropped: 0 };

  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const windows: StepWindow[] = [];

  let index = 0;
  let carry: GeoPoint | undefined;
  let counted = 0;

  for (const sample of ordered) {
    const slice: GeoPoint[] = carry ? [carry] : [];
    while (index < track.length && track[index]!.timestamp <= sample.timestamp) {
      slice.push(track[index]!);
      index += 1;
    }
    carry = slice[slice.length - 1];

    // Samples are the pedometer's running total for the run, so a window is
    // the difference. A total that goes backwards contributes nothing.
    const total = Math.max(0, Math.floor(sample.steps));
    const steps = Math.max(0, total - counted);
    counted = Math.max(counted, total);

    windows.push({ steps, metres: summarizeTrack(slice).distanceMetres });
  }

  return creditSteps(windows);
}
