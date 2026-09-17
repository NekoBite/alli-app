import { GOAL_RULES, weekGoals, weekTotals } from './goals';
import type { RunSummary } from './types';

const DAY = 86_400_000;
/** Midday, so a timezone offset cannot push a fixture into the previous day. */
const NOW = new Date(2026, 8, 17, 12, 0, 0).getTime();

function run(daysAgo: number, steps: number, overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: `run-${daysAgo}-${steps}`,
    startedAt: NOW - daysAgo * DAY,
    track: [],
    distanceMetres: 2000,
    movingSeconds: 600,
    confirmed: true,
    reward: {
      eligibleMetres: 2000,
      eligibleSteps: steps,
      basePoints: 200,
      multiplier: 1,
      grossPoints: 200,
      points: 200,
      steps,
      goalReached: steps >= GOAL_RULES.dailyStepGoal,
      stars: steps >= GOAL_RULES.dailyStepGoal ? 1 : 0,
      flags: [],
    },
    ...overrides,
  };
}

describe('weekGoals', () => {
  it('returns one bucket per day, oldest first and today last', () => {
    const week = weekGoals([], NOW);
    expect(week).toHaveLength(GOAL_RULES.weekDays);
    expect(week[week.length - 1]!.isToday).toBe(true);
    expect(week.filter((day) => day.isToday)).toHaveLength(1);
  });

  it('keeps empty days rather than dropping them — a gap is the point', () => {
    const week = weekGoals([run(3, 500)], NOW);
    expect(week.filter((day) => day.runs === 0)).toHaveLength(GOAL_RULES.weekDays - 1);
  });

  it('sums a day that holds several runs', () => {
    const week = weekGoals([run(0, 120), run(0, 150)], NOW);
    const today = week[week.length - 1]!;
    expect(today.runs).toBe(2);
    expect(today.steps).toBe(270);
    expect(today.metres).toBe(4000);
    expect(today.points).toBe(400);
  });

  it('marks a day met once its steps clear the goal, across runs', () => {
    const week = weekGoals([run(0, 120), run(0, 150)], NOW);
    expect(week[week.length - 1]!.goalMet).toBe(true);

    const short = weekGoals([run(0, 120)], NOW);
    expect(short[short.length - 1]!.goalMet).toBe(false);
  });

  it('ignores runs older than the window', () => {
    const week = weekGoals([run(GOAL_RULES.weekDays, 500)], NOW);
    expect(weekTotals(week).runs).toBe(0);
  });
});

describe('weekTotals', () => {
  it('adds up the window, counting only the days that were met', () => {
    const totals = weekTotals(weekGoals([run(0, 300), run(2, 100), run(4, 250)], NOW));
    expect(totals.days).toBe(GOAL_RULES.weekDays);
    expect(totals.runs).toBe(3);
    expect(totals.goalDays).toBe(2);
    expect(totals.steps).toBe(650);
    expect(totals.stars).toBe(2);
    expect(totals.movingSeconds).toBe(1800);
  });
});
