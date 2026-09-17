import { GOAL_RULES, weekGoals, weekTotals } from './goals';
import type { RunSummary } from './types';

const DAY = 86_400_000;
/** Midday, so a timezone offset cannot push a fixture into the previous day. */
const NOW = new Date(2026, 8, 17, 12, 0, 0).getTime();
const GOAL = GOAL_RULES.dailyStepGoal;

function run(daysAgo: number, steps: number, stars = 0): RunSummary {
  return {
    id: `run-${daysAgo}-${steps}-${stars}`,
    startedAt: NOW - daysAgo * DAY,
    track: [],
    distanceMetres: steps * 0.8,
    movingSeconds: 600,
    confirmed: true,
    reward: {
      eligibleMetres: steps * 0.8,
      steps,
      eligibleSteps: steps,
      stepsToday: steps,
      questGoal: GOAL,
      questCompleted: steps >= GOAL,
      questPaid: stars > 0,
      shoeMultiplier: 1,
      baseStars: stars > 0 ? 1 : 0,
      stars,
      flags: [],
    },
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
    const week = weekGoals([run(0, 1200), run(0, 1500)], NOW);
    const today = week[week.length - 1]!;
    expect(today.runs).toBe(2);
    expect(today.steps).toBe(2700);
    expect(today.metres).toBeCloseTo(2700 * 0.8, 5);
  });

  it('marks a day met once its steps clear the quest goal, across runs', () => {
    const met = weekGoals([run(0, GOAL - 500), run(0, 500, 1)], NOW);
    expect(met[met.length - 1]!.questMet).toBe(true);
    expect(met[met.length - 1]!.stars).toBe(1);

    const short = weekGoals([run(0, GOAL - 1)], NOW);
    expect(short[short.length - 1]!.questMet).toBe(false);
  });

  it('ignores runs older than the window', () => {
    const week = weekGoals([run(GOAL_RULES.weekDays, GOAL)], NOW);
    expect(weekTotals(week).runs).toBe(0);
  });
});

describe('weekTotals', () => {
  it('adds up the window, counting only the days whose quest was met', () => {
    const totals = weekTotals(weekGoals([run(0, GOAL, 1), run(2, 100), run(4, GOAL, 3)], NOW));
    expect(totals.days).toBe(GOAL_RULES.weekDays);
    expect(totals.runs).toBe(3);
    expect(totals.questDays).toBe(2);
    expect(totals.steps).toBe(GOAL * 2 + 100);
    expect(totals.stars).toBe(4);
  });
});
