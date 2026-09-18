import type { TokenSymbol } from '@/services/chain';

/** Standard seeds cost ALLI and play the low-carbon loop; premium seeds cost USDT and play the simple one. */
export type SeedTier = 'standard' | 'premium';

/**
 * Which care loop a seed plays.
 *
 * `simple`: water, sun and soil with fixed thresholds, fertiliser bought with
 * stars. `lowCarbon`: the same three statuses, but weather conditions move the
 * thresholds, practices earned in minigames counter them, compost is gathered
 * and synthetic fertiliser is the easy way that costs ALLI and carbon score.
 */
export type CareProfile = 'simple' | 'lowCarbon';

export type StatusId = 'water' | 'sun' | 'soil';
export type ConditionId = 'heatwave' | 'haze' | 'drought' | 'monsoon';
export type PracticeId = 'mulch' | 'noBurn' | 'coverCrop' | 'drip';
export type FertiliserId = 'stars' | 'compost' | 'synthetic';
export type MinigameId = 'compost' | 'mulch' | 'haze';

export type Seed = {
  id: string;
  name: string;
  species: string;
  tier: SeedTier;
  /** Currency the seed is bought in: ALLI for standard, USDT for premium. */
  currency: Extract<TokenSymbol, 'ALLI' | 'USDT'>;
  price: number;
  careProfile: CareProfile;
  /** Stars a day above the line pays, before the streak and carbon multipliers. */
  starsPerDay: number;
  /** Days from planting until the tree retires. */
  lifetimeDays: number;
  /** Bonus applied to the run quest while this tree is thriving, e.g. 0.05 = +5%. */
  runBonus: number;
  blurb: string;
};

/**
 * A status is the level it was set to and when. The level now is derived from
 * the two and the decay rate, so nothing here goes stale and the server can
 * recompute the same value from the same row.
 */
export type StatusState = { level: number; at: number };

/** A day's reward waiting on the canopy. */
export type Claimable = { day: string; stars: number; expiresAt: number };

export type Plot = {
  id: string;
  seedId: string;
  plantedAt: number;
  statuses: Record<StatusId, StatusState>;
  /** Local day (YYYY-MM-DD) up to which the nightly rollover has been settled. */
  settledDay: string;
  claimable: Claimable[];
  /** Consecutive settled days that paid. */
  streakDays: number;
  /** Local day the sun meter was last filled, so a day gets one fill. */
  sunFilledDay?: string;
  /** Compost units matured and ready to use (low-carbon only). */
  compostReady: number;
  /** A heap in progress; one at a time. */
  compostMaturesAt?: number;
  /** Times synthetic fertiliser was used. Raises the garden's carbon score. */
  synthetics: number;
  /** Times compost was used. Lowers it. */
  composts: number;
  practices: PracticeId[];
  /** Set the moment the tree was observed dead. It stays dead. */
  diedAt?: number;
  /**
   * Optional link to a real planting — this is what keeps the game honest about
   * being more than a farm sim. Null until a partner confirms a tree is in
   * the ground.
   */
  realTreeRef?: string;
};

/** A weather event the server issues; it moves thresholds while it lasts. */
export type Condition = { id: ConditionId; from: number; to: number };

export type Garden = {
  plots: Plot[];
  conditions: Condition[];
  /** Carbon score adjustment earned from community quest rewards (negative is good). */
  carbonAdjustment: number;
};

export type Health = 'thriving' | 'stressed' | 'wilting' | 'dead' | 'retired';
export type GrowthStage = 'seed' | 'sprout' | 'sapling' | 'tree';

export type StatusView = {
  id: StatusId;
  label: string;
  level: number;
  threshold: number;
  ok: boolean;
  /** ms until the level falls below the line; 0 if it already has. */
  msUntilBelow: number;
  /** ms until empty; 0 if empty. */
  msUntilEmpty: number;
};

/** Everything the UI needs about a plot, projected to a moment in time. */
export type PlotView = Plot & {
  seed: Seed;
  ageDays: number;
  daysLeft: number;
  stage: GrowthStage;
  health: Health;
  meters: StatusView[];
  allAbove: boolean;
  claimableStars: number;
  /** How many sparkle objects to draw on the canopy. */
  sparkles: number;
  sunTapsNeeded: number;
  sunFilledToday: boolean;
  activeConditions: ConditionId[];
  /** Stars the next settled day pays if the tree stays above the line. */
  nextReward: number;
  compost: { ready: number; maturing: boolean; msUntilMature: number };
  /** Multiplier the garden's carbon score applies to this tree's reward (1 for the simple profile). */
  carbonMultiplier: number;
};
