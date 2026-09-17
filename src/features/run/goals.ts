import { dayKey } from '@/utils/time';
import { REWARD_RULES } from './rewards';
import type { RunSummary } from './types';

/**
 * Daily and weekly goal tracking, derived from run history rather than stored.
 *
 * Nothing here is authoritative — it is a read over runs the server already
 * validated, so there is no second ledger to keep in step. Buckets are the
 * runner's local days, the same bucket the daily point cap uses.
 */
export const GOAL_RULES = {
  /** Days shown in the strip. */
  weekDays: 7,
  /** A day counts as met once its credited steps clear one run's step goal. */
  dailyStepGoal: REWARD_RULES.stepGoal,
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
  steps: number;
  stars: number;
  points: number;
  goalMet: boolean;
  isToday: boolean;
};

export type WeekTotals = {
  /** Days in the window whose goal was met. */
  goalDays: number;
  days: number;
  runs: number;
  metres: number;
  movingSeconds: number;
  steps: number;
  stars: number;
  points: number;
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
      points: 0,
      goalMet: false,
      isToday: offset === 0,
    });
  }

  for (const run of history) {
    const bucket = buckets.get(dayKey(new Date(run.startedAt)));
    if (!bucket) continue;
    bucket.runs += 1;
    bucket.metres += run.distanceMetres;
    bucket.movingSeconds += run.movingSeconds;
    bucket.steps += run.reward.steps;
    bucket.stars += run.reward.stars;
    bucket.points += run.reward.points;
  }

  for (const bucket of buckets.values()) {
    bucket.goalMet = bucket.steps >= GOAL_RULES.dailyStepGoal;
  }

  return [...buckets.values()];
}

export function weekTotals(days: DayGoal[]): WeekTotals {
  return days.reduce<WeekTotals>(
    (total, day) => ({
      goalDays: total.goalDays + (day.goalMet ? 1 : 0),
      days: total.days + 1,
      runs: total.runs + day.runs,
      metres: total.metres + day.metres,
      movingSeconds: total.movingSeconds + day.movingSeconds,
      steps: total.steps + day.steps,
      stars: total.stars + day.stars,
      points: total.points + day.points,
    }),
    { goalDays: 0, days: 0, runs: 0, metres: 0, movingSeconds: 0, steps: 0, stars: 0, points: 0 },
  );
}
