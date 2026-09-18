/**
 * The weekly quest is global: one goal for the whole community each week,
 * everyone's contributions counted together, and one reward shared by every
 * player who did their part. It is the thing to talk about.
 */

/** What the week counts. Every metric is an action the server already sees. */
export type QuestMetric =
  | 'compost'
  | 'mulch'
  | 'noBurn'
  | 'thrivingNights'
  | 'sunFills'
  | 'steps'
  | 'synthetic';

/**
 * `reach`: the community must get the total up to the goal.
 * `stayUnder`: the community must keep the total at or below the goal.
 */
export type QuestKind = 'reach' | 'stayUnder';

export type QuestRule = {
  id: string;
  metric: QuestMetric;
  kind: QuestKind;
  title: string;
  blurb: string;
  /** How one player moves the number. */
  howTo: string;
  lesson: string;
  /** Months (0 = January, UTC) the quest can be issued in; absent means any. */
  months?: number[];
  goal: number;
  /** A harder target with a bigger reward, for the community to argue about. */
  stretchGoal?: number;
  /**
   * What one player must have done to share the reward: at least this much
   * for `reach`, at most this much for `stayUnder`.
   */
  personal: number;
  reward: { stars: number; stretchStars: number; carbonDelta: number };
};

/** A quest as issued for one week. */
export type WeeklyQuest = QuestRule & {
  /** The week it runs, Monday 00:00 UTC to the next. */
  weekStart: number;
  weekEnd: number;
};

export type QuestOutcome = 'open' | 'none' | 'goal' | 'stretch';

export type QuestProgress = {
  quest: WeeklyQuest;
  /** The community's total so far. */
  community: number;
  /** Players who have contributed at least once. */
  contributors: number;
  /** This player's contribution. */
  mine: number;
};

/** Last week, once settled. */
export type QuestResult = {
  quest: WeeklyQuest;
  community: number;
  mine: number;
  outcome: Exclude<QuestOutcome, 'open'>;
  qualified: boolean;
  /** Stars this player was paid. */
  paidStars: number;
};

export type QuestSnapshot = {
  current: QuestProgress;
  last?: QuestResult;
  /** The server's clock, so "ends in" is not the phone's opinion. */
  serverTime: number;
};
