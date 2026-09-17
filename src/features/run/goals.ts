import { dayKey } from '@/utils/time';
import { REWARD_RULES } from './rewards';
import type { RunSummary } from './types';

/**
 * Daily and weekly quest tracking, derived from run history rather than stored.
 *
 * Nothing here is authoritative — it is a read over runs the server already
 * validated, so there is no second ledger to keep in step. Buckets are the
 * runner's local days, the same bucket the daily quest is counted in.
 */
export const GOAL_RULES = {
  /** Days shown in the strip. */
  weekDays: 7,
  /** Steps a day needs for its quest to pay. */
  dailyStepGoal: REWARD_RULES.dailyStepGoal,
} as const;

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export type DayGoal = {
  /** Local calendar day, YYYY-MM-DD. */
  day: string;
  /** Short weekday name, for the strip. */
  label: string;
  runs: number;
  metres: number;
  movingSeconds: number;
  /** Steps that counted towards the quest. */
  steps: number;
  stars: number;
  /** True once the day's credited steps clear the quest goal. */
  questMet: boolean;
  isToday: boolean;
};

export type WeekTotals = {
  /** Days in the window whose quest was completed. */
  questDays: number;
  days: number;
  runs: number;
  metres: number;
  movingSeconds: number;
  steps: number;
  stars: number;
};

/**
 * The last `days` local days, oldest first, with today last — the order the
 * strip reads in. Days with no runs are present and empty rather than missing,
 * because a gap in a streak is the thing the strip exists to show.
 */
export function weekGoals(
  history: RunSummary[],
  now: number = Date.now(),
  days: number = GOAL_RULES.weekDays,
): DayGoal[] {
  const today = new Date(now);
  const buckets = new Map<string, DayGoal>();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const key = dayKey(date);
    buckets.set(key, {
      day: key,
      label: DAY_LABELS[date.getDay()]!,
      runs: 0,
      metres: 0,
      movingSeconds: 0,
      steps: 0,
      stars: 0,
      questMet: false,
      isToday: offset === 0,
    });
  }

  for (const run of history) {
    const bucket = buckets.get(dayKey(new Date(run.startedAt)));
    if (!bucket) continue;
    bucket.runs += 1;
    bucket.metres += run.distanceMetres;
    bucket.movingSeconds += run.movingSeconds;
    bucket.steps += run.reward.eligibleSteps;
    bucket.stars += run.reward.stars;
  }

  for (const bucket of buckets.values()) {
    bucket.questMet = bucket.steps >= GOAL_RULES.dailyStepGoal;
  }

  return [...buckets.values()];
}

export function weekTotals(days: DayGoal[]): WeekTotals {
  return days.reduce<WeekTotals>(
    (total, day) => ({
      questDays: total.questDays + (day.questMet ? 1 : 0),
      days: total.days + 1,
      runs: total.runs + day.runs,
      metres: total.metres + day.metres,
      movingSeconds: total.movingSeconds + day.movingSeconds,
      steps: total.steps + day.steps,
      stars: total.stars + day.stars,
    }),
    { questDays: 0, days: 0, runs: 0, metres: 0, movingSeconds: 0, steps: 0, stars: 0 },
  );
}
