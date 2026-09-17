/**
 * The single point where the server reaches into the app's source.
 *
 * These modules are pure — no React, no Expo, no network — which is what lets
 * one implementation serve both sides. The phone computes a preview with these
 * functions; the server recomputes the authoritative result with the very same
 * ones. A reimplementation here would be a bug waiting to happen: users would
 * be shown one number and credited another the first time the two drifted.
 *
 * Everything the server needs from the app goes through this file, so the
 * coupling is one import away from being audited.
 */
export {
  summarizeTrack,
  averageSpeed,
  haversine,
  MAX_ACCURACY_METRES,
  MAX_HOP_METRES,
  MIN_MOVING_SPEED_MPS,
} from '../../../src/features/run/geo.ts';

export {
  creditStepWindow,
  creditSteps,
  creditStepSamples,
  STEP_RULES,
} from '../../../src/features/run/steps.ts';

export type { StepWindow, StepCredit } from '../../../src/features/run/steps.ts';

export {
  calculateReward,
  pointsToAlli,
  alliToPoints,
  explainFlag,
  REWARD_RULES,
} from '../../../src/features/run/rewards.ts';

export type {
  GeoPoint,
  RunSession,
  RunSummary,
  RewardBreakdown,
  RewardFlag,
  StepSample,
} from '../../../src/features/run/types.ts';
