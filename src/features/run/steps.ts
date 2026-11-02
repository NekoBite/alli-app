import type { StepSample } from './types';

/**
 * Step credit.
 *
 * Steps are credited as the pedometer reports them. GPS plays no part: people walk on a treadmill,
 * in a corridor, round a room, anywhere the satellites cannot see them move, and a rule that threw
 * those steps away would punish exactly the users the quest is for. (An earlier version paired
 * every window with the ground covered and discarded steps GPS could not back; it was removed on
 * the client's instruction.)
 *
 * That removes the only sensor-side check on the pedometer, so be plain about what is left:
 * nothing here stops a phone being shaken, or a modified client sending whatever it likes. The one
 * bound is cadence, below, and it only stops the lazy case of a total that no person could have
 * walked in the time. Real protection is device attestation and the once-a-day quest, which is
 * what caps emission per account.
 *
 * Pure, like `geo.ts` and `rewards.ts`, so the server can re-run it on the raw samples and reach
 * the same number the phone showed.
 */

export const STEP_RULES = {
  /**
   * The fastest cadence that will be credited, in steps per minute. Elite sprinters turn over about
   * 200; a run of 300 is not a person. Steps beyond it in a window are dropped, not the whole run,
   * so a burst from a delayed sensor callback costs the excess and nothing more.
   */
  maxStepsPerMinute: 300,
  /**
   * Windows shorter than this are treated as this long. Two callbacks a millisecond apart are one
   * moment, not a window with no time in it to walk in.
   */
  minWindowSeconds: 1,
} as const;

/** One pedometer reading, with how long it took. */
export type StepWindow = {
  /** Steps the pedometer reported since the previous window. */
  steps: number;
  /** Seconds since the previous window. `Infinity` for a window with no known start. */
  seconds: number;
};

export type StepCredit = {
  /** Steps that counted. */
  steps: number;
  /** Steps over the cadence limit. Zero for any real walk. */
  dropped: number;
};

/** Credits one pedometer window, capped at what a person could walk in its duration. */
export function creditStepWindow(window: StepWindow): StepCredit {
  const reported = Math.max(0, Math.floor(window.steps));
  if (reported === 0) return { steps: 0, dropped: 0 };

  const seconds = Math.max(STEP_RULES.minWindowSeconds, Number.isNaN(window.seconds) ? 0 : window.seconds);
  const cap = Math.floor((seconds * STEP_RULES.maxStepsPerMinute) / 60);
  const steps = Math.min(reported, cap);
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
 * Re-credits a whole run from the pedometer's running totals: the server's version of the live
 * count the run screen shows. A client that uploads a million steps in a minute credits what a
 * person could have walked in it.
 *
 * The samples are running totals for the run, so a window is the difference between neighbours, and
 * a total that goes backwards contributes nothing. `startedAt` bounds the first window; without it
 * the first window has no known duration and is not capped.
 */
export function creditStepSamples(samples: StepSample[], startedAt?: number): StepCredit {
  if (samples.length === 0) return { steps: 0, dropped: 0 };

  const ordered = [...samples].sort((a, b) => a.timestamp - b.timestamp);
  const windows: StepWindow[] = [];
  let counted = 0;
  let previous = startedAt;

  for (const sample of ordered) {
    const total = Math.max(0, Math.floor(sample.steps));
    const steps = Math.max(0, total - counted);
    counted = Math.max(counted, total);

    // A sample stamped before the run began (clock skew) is a minimum-length window, not a
    // negative one.
    const seconds = previous === undefined ? Infinity : Math.max(0, (sample.timestamp - previous) / 1000);
    windows.push({ steps, seconds });
    previous = sample.timestamp;
  }

  return creditSteps(windows);
}
