import {
  qualifies,
  questForWeek,
  rewardFor,
  standing,
  WEEK_MS,
  weekStart,
} from '@/features/quests/quests';
import type { QuestMetric, QuestResult, QuestSnapshot, WeeklyQuest } from '@/features/quests/types';
import { mockStars } from './mockStars';

/**
 * The community quest, as the server would keep it: this player's
 * contributions per metric for the current week, last week's result, and the
 * carbon adjustment quest rewards have earned the garden. The rest of the
 * community is simulated so the bar moves without other players.
 */

type Week = { start: number; mine: Record<QuestMetric, number> };

function freshWeek(start: number): Week {
  return {
    start,
    mine: { compost: 0, mulch: 0, noBurn: 0, thrivingNights: 0, sunFills: 0, steps: 0, synthetic: 0 },
  };
}

/** The rest of the players: ramps through the week to just short of the goal. */
function others(quest: WeeklyQuest, now: number): number {
  const elapsed = Math.min(1, Math.max(0, (now - quest.weekStart) / WEEK_MS));
  const atWeekEnd = quest.kind === 'reach' ? quest.goal * 0.92 : quest.goal * 0.55;
  return Math.round(atWeekEnd * Math.pow(elapsed, 0.8));
}

function contributorsAt(quest: WeeklyQuest, now: number, mine: number): number {
  const elapsed = Math.min(1, Math.max(0, (now - quest.weekStart) / WEEK_MS));
  return 30 + Math.floor(elapsed * 80) + (mine > 0 ? 1 : 0);
}

// Demo state: last week this player did their part, this week has started.
let week: Week = (() => {
  const previous = freshWeek(weekStart(Date.now()) - WEEK_MS);
  const quest = questForWeek(previous.start);
  previous.mine[quest.metric] = quest.kind === 'reach' ? quest.personal : 0;
  return previous;
})();
let last: QuestResult | undefined;
let carbonAdjustment = 0;

/** Closes any finished week: pays the reward and books the carbon delta. */
function settle(now: number): void {
  const start = weekStart(now);
  if (week.start === start) return;

  const quest = questForWeek(week.start);
  const mine = week.mine[quest.metric];
  const community = others(quest, quest.weekEnd) + mine;
  const result = standing({ quest, community });
  const qualified = qualifies(quest, mine);
  const paidStars = qualified ? rewardFor(quest, result) : 0;
  if (paidStars > 0) mockStars.credit(paidStars);
  if (qualified && result !== 'none') carbonAdjustment += quest.reward.carbonDelta;
  last = { quest, community, mine, outcome: result, qualified, paidStars };

  week = freshWeek(start);
  // Seed a little of this week's progress so the demo card is not empty.
  const current = questForWeek(start);
  if (current.kind === 'reach') week.mine[current.metric] = Math.min(current.personal, 1);
}

export const mockQuests = {
  /** A contribution the server would have counted from the action it just handled. */
  record(metric: QuestMetric, amount = 1): void {
    settle(Date.now());
    week.mine[metric] += amount;
  },

  snapshot(now: number): QuestSnapshot {
    settle(now);
    const quest = questForWeek(now);
    const mine = week.mine[quest.metric];
    return {
      current: {
        quest,
        community: others(quest, now) + mine,
        contributors: contributorsAt(quest, now, mine),
        mine,
      },
      last,
      serverTime: now,
    };
  },

  /** Carbon score adjustment the garden has earned from quest rewards. */
  carbonAdjustment: () => carbonAdjustment,
};
