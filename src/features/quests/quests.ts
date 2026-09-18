import { roundStars } from '@/features/run/rewards';
import { METRIC_LABEL, QUESTS } from './rules';
import type { QuestOutcome, QuestProgress, QuestRule, WeeklyQuest } from './types';

/**
 * The weekly quest, as pure functions. The server issues the quest and keeps
 * the community total; the phone only projects. Weeks run Monday 00:00 UTC to
 * the next, one clock for the whole community, so "ends in" means the same
 * thing in every timezone.
 */

export const WEEK_MS = 7 * 86_400_000;

/** Monday 00:00 UTC of the week containing `now`. */
export function weekStart(now: number): number {
  const date = new Date(now);
  const sinceMonday = (date.getUTCDay() + 6) % 7;
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - sinceMonday);
}

export function weekEnd(now: number): number {
  return weekStart(now) + WEEK_MS;
}

/** A stable index for the week, for the rotation. */
export function weekIndex(now: number): number {
  return Math.floor(weekStart(now) / WEEK_MS);
}

/**
 * The quest for the week containing `now`: the eligible quests for that
 * month in rotation. The server may override this; the mock and the tests
 * use it as issued.
 */
export function questForWeek(now: number, catalogue: QuestRule[] = QUESTS): WeeklyQuest {
  const start = weekStart(now);
  const month = new Date(start).getUTCMonth();
  const eligible = catalogue.filter((q) => !q.months || q.months.includes(month));
  const pool = eligible.length > 0 ? eligible : catalogue;
  const rule = pool[weekIndex(now) % pool.length]!;
  return { ...rule, weekStart: start, weekEnd: start + WEEK_MS };
}

/** 0–1 towards the goal, or for `stayUnder` how much of the cap is used. */
export function progressFraction(progress: Pick<QuestProgress, 'quest' | 'community'>): number {
  const { quest, community } = progress;
  if (quest.goal <= 0) return 1;
  return Math.min(1, Math.max(0, community / quest.goal));
}

/** Where the community stands, or would stand if the week ended now. */
export function standing(progress: Pick<QuestProgress, 'quest' | 'community'>): Exclude<QuestOutcome, 'open'> {
  const { quest, community } = progress;
  if (quest.kind === 'reach') {
    if (quest.stretchGoal !== undefined && community >= quest.stretchGoal) return 'stretch';
    return community >= quest.goal ? 'goal' : 'none';
  }
  if (quest.stretchGoal !== undefined && community <= quest.stretchGoal) return 'stretch';
  return community <= quest.goal ? 'goal' : 'none';
}

export function outcome(progress: Pick<QuestProgress, 'quest' | 'community'>, now: number): QuestOutcome {
  return now < progress.quest.weekEnd ? 'open' : standing(progress);
}

/** Whether this player did their part. */
export function qualifies(quest: QuestRule, mine: number): boolean {
  return quest.kind === 'reach' ? mine >= quest.personal : mine <= quest.personal;
}

/** Stars one qualifying player is paid for the outcome. */
export function rewardFor(quest: QuestRule, result: QuestOutcome): number {
  if (result === 'stretch') return roundStars(quest.reward.stretchStars);
  if (result === 'goal') return roundStars(quest.reward.stars);
  return 0;
}

/** ms until the week ends; 0 once it has. */
export function msLeft(quest: WeeklyQuest, now: number): number {
  return Math.max(0, quest.weekEnd - now);
}

export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  return Math.round(n).toLocaleString('en-US');
}

/** What the community stands to earn, in words. */
export function rewardLine(quest: QuestRule): string {
  const stretch = quest.stretchGoal !== undefined ? `, ${quest.reward.stretchStars} ★ at the stretch goal` : '';
  return `${quest.reward.stars} ★ each${stretch}`;
}

/** The message a player shares to rally the others. */
export function shareText(progress: QuestProgress, now: number): string {
  const { quest, community, mine, contributors } = progress;
  const pct = Math.round(progressFraction(progress) * 100);
  const left = msLeft(quest, now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3_600_000);
  const when = left <= 0 ? 'The week is over.' : `${days}d ${hours}h left.`;
  const label = METRIC_LABEL[quest.metric];
  const target =
    quest.kind === 'reach'
      ? `${formatCount(community)} / ${formatCount(quest.goal)} ${label} (${pct}%)`
      : `${formatCount(community)} ${label} used of a ${formatCount(quest.goal)} cap`;
  return `Alli weekly quest: ${quest.title}. ${target}, ${contributors} of us in. I'm at ${formatCount(mine)}. ${when} ${quest.howTo}`;
}
