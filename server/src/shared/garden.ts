/**
 * The garden and quest modules the server shares with the app, through one
 * file, for the same reason as shared/run.ts: the phone previews with these
 * functions and the server settles with the very same ones. See that file.
 */
export {
  adoptPractice,
  calendarConditions,
  carbonMultiplier,
  carbonScore,
  claim,
  fertilise,
  fillSun,
  healthAt,
  newPlot,
  settle,
  startCompost,
  water,
} from '../../../src/features/garden/care.ts';
export type { GardenContext } from '../../../src/features/garden/care.ts';

export { findSeed, SEEDS } from '../../../src/features/garden/catalog.ts';
export { FERTILISERS, MINIGAMES } from '../../../src/features/garden/rules.ts';
export type {
  FertiliserId,
  Garden,
  MinigameId,
  Plot,
  PracticeId,
} from '../../../src/features/garden/types.ts';

export {
  qualifies,
  questForWeek,
  rewardFor,
  standing,
  WEEK_MS,
  weekStart,
} from '../../../src/features/quests/quests.ts';
export type {
  QuestMetric,
  QuestResult,
  QuestSnapshot,
  WeeklyQuest,
} from '../../../src/features/quests/types.ts';

export { dayKey } from '../../../src/utils/time.ts';
