import {
  formatCount,
  msLeft,
  outcome,
  progressFraction,
  qualifies,
  questForWeek,
  rewardFor,
  shareText,
  standing,
  WEEK_MS,
  weekEnd,
  weekIndex,
  weekStart,
} from './quests';
import { QUESTS } from './rules';
import type { QuestProgress, QuestRule } from './types';

// Friday 18 Sep 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 8, 18, 12);
const MONDAY = Date.UTC(2026, 8, 14);

const compost = QUESTS.find((q) => q.id === 'compost-week')!;
const synthetic = QUESTS.find((q) => q.id === 'synthetic-free')!;

function progress(quest: QuestRule, community: number, mine = 0): QuestProgress {
  return {
    quest: { ...quest, weekStart: MONDAY, weekEnd: MONDAY + WEEK_MS },
    community,
    contributors: 40,
    mine,
  };
}

describe('weeks', () => {
  it('start on Monday 00:00 UTC and run seven days', () => {
    expect(weekStart(NOW)).toBe(MONDAY);
    expect(weekStart(MONDAY)).toBe(MONDAY);
    expect(weekStart(MONDAY - 1)).toBe(MONDAY - WEEK_MS);
    expect(weekEnd(NOW)).toBe(MONDAY + WEEK_MS);
    expect(weekIndex(NOW + WEEK_MS)).toBe(weekIndex(NOW) + 1);
    expect(msLeft({ ...compost, weekStart: MONDAY, weekEnd: MONDAY + WEEK_MS }, NOW)).toBe(
      MONDAY + WEEK_MS - NOW,
    );
  });

  it('issues the same quest all week, a different one next week, and only in season', () => {
    const thisWeek = questForWeek(NOW);
    expect(questForWeek(MONDAY).id).toBe(thisWeek.id);
    expect(questForWeek(MONDAY + WEEK_MS - 1).id).toBe(thisWeek.id);
    expect(thisWeek.weekStart).toBe(MONDAY);
    expect(thisWeek.months === undefined || thisWeek.months.includes(8)).toBe(true);

    const ids = new Set(Array.from({ length: 8 }, (_, i) => questForWeek(NOW + i * WEEK_MS).id));
    expect(ids.size).toBeGreaterThan(1);

    // In September neither the heatwave nor the haze quest can be issued.
    for (let i = 0; i < 4; i += 1) {
      const id = questForWeek(Date.UTC(2026, 8, 1) + i * WEEK_MS).id;
      expect(['mulch-before-the-heat', 'clear-skies']).not.toContain(id);
    }
    // In March the haze quest can be.
    const march = new Set(Array.from({ length: 6 }, (_, i) => questForWeek(Date.UTC(2026, 2, 2) + i * WEEK_MS).id));
    expect([...march].some((id) => id === 'clear-skies' || id === 'mulch-before-the-heat')).toBe(true);
  });
});

describe('reach quests', () => {
  it('measure progress and stand at none, goal or stretch', () => {
    expect(progressFraction(progress(compost, 250))).toBeCloseTo(0.5);
    expect(progressFraction(progress(compost, 900))).toBe(1);
    expect(standing(progress(compost, 250))).toBe('none');
    expect(standing(progress(compost, 500))).toBe('goal');
    expect(standing(progress(compost, 800))).toBe('stretch');
  });

  it('stay open until the week ends', () => {
    expect(outcome(progress(compost, 600), NOW)).toBe('open');
    expect(outcome(progress(compost, 600), MONDAY + WEEK_MS)).toBe('goal');
    expect(outcome(progress(compost, 100), MONDAY + WEEK_MS)).toBe('none');
  });

  it('pay every player who did their part', () => {
    expect(qualifies(compost, 1)).toBe(false);
    expect(qualifies(compost, 2)).toBe(true);
    expect(rewardFor(compost, 'none')).toBe(0);
    expect(rewardFor(compost, 'goal')).toBe(0.1);
    expect(rewardFor(compost, 'stretch')).toBe(0.2);
    expect(rewardFor(compost, 'open')).toBe(0);
  });
});

describe('stay-under quests', () => {
  it('succeed by staying under the cap, with the stretch being a lower cap', () => {
    expect(standing(progress(synthetic, 250))).toBe('none');
    expect(standing(progress(synthetic, 150))).toBe('goal');
    expect(standing(progress(synthetic, 100))).toBe('stretch');
  });

  it('share the reward only with players who used none', () => {
    expect(qualifies(synthetic, 0)).toBe(true);
    expect(qualifies(synthetic, 1)).toBe(false);
  });
});

describe('share text', () => {
  it('says where the community is, how long is left and what to do', () => {
    const text = shareText(progress(compost, 310, 3), NOW);
    expect(text).toContain('Compost week');
    expect(text).toContain('310 / 500 compost uses (62%)');
    expect(text).toContain('40 of us');
    expect(text).toContain("I'm at 3");
    expect(text).toContain('2d 12h left');
    expect(text).toContain(compost.howTo);
  });

  it('formats big counts for a message', () => {
    expect(formatCount(950)).toBe('950');
    expect(formatCount(12_000)).toBe('12k');
    expect(formatCount(20_000_000)).toBe('20M');
    expect(formatCount(24_500_000)).toBe('24.5M');
  });
});
