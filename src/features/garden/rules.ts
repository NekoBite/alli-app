import type {
  CareProfile,
  ConditionId,
  FertiliserId,
  MinigameId,
  PracticeId,
  StatusId,
} from './types';

/**
 * Care rules, as data. Everything that decides how a tree behaves is a number
 * in this file, so tuning is an edit here and never a rewrite of `care.ts`.
 * These are placeholders that make the loop playable, not a balanced economy;
 * before launch they belong on the server (docs/architecture.md §4).
 */

export type StatusRule = {
  label: string;
  /** Hours from full to empty with no care and no conditions. */
  emptiesAfterHours: number;
  /** Base level a status must stay above for the day to pay. */
  threshold: number;
};

export const STATUS_RULES: Record<StatusId, StatusRule> = {
  water: { label: 'Water', emptiesAfterHours: 36, threshold: 0.5 },
  sun: { label: 'Sun', emptiesAfterHours: 48, threshold: 0.5 },
  soil: { label: 'Soil', emptiesAfterHours: 120, threshold: 0.4 },
};

export const STATUS_ORDER: StatusId[] = ['water', 'sun', 'soil'];

export const CARE_RULES = {
  /** What one tap of the watering can adds. */
  waterPerCan: 0.5,
  /** Taps on the tree that fill the sun meter for the day. */
  sunTapsPerFill: 100,
  /** A status at zero this long puts the tree into wilting. */
  wiltAfterHoursAtZero: 48,
  /** A status at zero this long kills it. */
  dieAfterHoursAtZero: 120,
  /** Uncollected sparkles fade after this many days. */
  claimExpiresAfterDays: 3,
  /** Each consecutive paid day adds this to the reward, up to the cap. */
  streakBonusPerDay: 0.05,
  streakBonusMax: 0.5,
  /** Sparkle objects on the canopy: one per this many stars, capped. */
  starsPerSparkle: 0.05,
  maxSparkles: 8,
  /** A gathered heap turns into usable compost after this long. */
  compostMaturesAfterHours: 12,
  /** Carbon score: synthetic fertiliser adds, compost and practices subtract. */
  carbonPerSynthetic: 1,
  carbonPerCompost: -1,
  carbonPerPractice: -1,
  /** Each point of carbon score moves the low-carbon reward multiplier by this much. */
  carbonMultiplierPerPoint: 0.05,
  carbonMultiplierMin: 0.6,
  carbonMultiplierMax: 1.4,
  /** Growth stages by age in days. */
  stageDays: { sprout: 2, sapling: 6, tree: 12 },
} as const;

export type ConditionRule = {
  label: string;
  /** Months (0 = January) the server issues it in; empty means only ever at random. */
  months: number[];
  /** Added to the base threshold of a status while the condition lasts. */
  thresholdDelta?: Partial<Record<StatusId, number>>;
  /** Multiplies how fast a status decays. */
  decayFactor?: Partial<Record<StatusId, number>>;
  /** Multiplies the taps a sun fill needs. */
  sunTapsFactor?: number;
  /** The practice that makes a tree immune to it. */
  counteredBy: PracticeId;
  /** The minigame that earns that practice. */
  minigame?: MinigameId;
  lesson: string;
};

export const CONDITIONS: Record<ConditionId, ConditionRule> = {
  heatwave: {
    label: 'Heatwave',
    months: [2, 3, 4],
    thresholdDelta: { water: 0.25 },
    decayFactor: { water: 1.5 },
    counteredBy: 'mulch',
    minigame: 'mulch',
    lesson: 'Bare soil bakes. A layer of mulch keeps the roots cool and the water in the ground.',
  },
  haze: {
    label: 'Haze',
    months: [1, 2, 3],
    sunTapsFactor: 1.5,
    counteredBy: 'noBurn',
    minigame: 'haze',
    lesson:
      'Burning crop residue is what turns the sky grey each dry season. Baling it keeps the carbon in the soil and the PM2.5 out of the air.',
  },
  drought: {
    label: 'Drought',
    months: [],
    decayFactor: { water: 2 },
    counteredBy: 'mulch',
    minigame: 'mulch',
    lesson: 'In a drought every drop that evaporates is one you pumped for nothing. Cover the soil.',
  },
  monsoon: {
    label: 'Monsoon',
    months: [6, 7, 8, 9],
    thresholdDelta: { water: -0.2 },
    decayFactor: { water: 0.5, soil: 1.3 },
    counteredBy: 'coverCrop',
    lesson: 'Heavy rain washes bare soil and its nutrients away. Living roots hold both in place.',
  },
};

export type PracticeRule = {
  label: string;
  thresholdDelta?: Partial<Record<StatusId, number>>;
  decayFactor?: Partial<Record<StatusId, number>>;
  counters: ConditionId[];
  lesson: string;
};

export const PRACTICES: Record<PracticeId, PracticeRule> = {
  mulch: {
    label: 'Mulch',
    decayFactor: { water: 0.7 },
    counters: ['heatwave', 'drought'],
    lesson: 'Mulch shades the soil, slows evaporation and feeds the soil as it breaks down.',
  },
  noBurn: {
    label: 'No-burn pledge',
    counters: ['haze'],
    lesson: 'Residue that is baled or composted instead of burned keeps its carbon on the farm.',
  },
  coverCrop: {
    label: 'Cover crop',
    decayFactor: { soil: 0.7 },
    counters: ['monsoon'],
    lesson: 'A living cover between trees keeps roots in the ground year round, which is how soil stores carbon.',
  },
  drip: {
    label: 'Drip irrigation',
    thresholdDelta: { water: -0.1 },
    counters: [],
    lesson: 'Drip lines put water at the roots. Flooding a field pumps and loses far more.',
  },
};

export type FertiliserRule = {
  label: string;
  profile: CareProfile;
  priceStars?: number;
  priceAlli?: number;
  carbonDelta: number;
  blurb: string;
};

export const FERTILISERS: Record<FertiliserId, FertiliserRule> = {
  stars: {
    label: 'Fertiliser',
    profile: 'simple',
    priceStars: 0.05,
    carbonDelta: 0,
    blurb: 'Fills the soil meter. Bought with stars.',
  },
  compost: {
    label: 'Compost',
    profile: 'lowCarbon',
    carbonDelta: CARE_RULES.carbonPerCompost,
    blurb: 'Free. Gathered in the field and matured overnight. Lowers your carbon score.',
  },
  synthetic: {
    label: 'Synthetic fertiliser',
    profile: 'lowCarbon',
    priceAlli: 5,
    carbonDelta: CARE_RULES.carbonPerSynthetic,
    blurb:
      'Instant, bought with ALLI. Made from natural gas and releases nitrous oxide, so it raises your carbon score.',
  },
};

export type MinigameRule = {
  label: string;
  blurb: string;
  durationMs: number;
  /** What a win applies to the tree. */
  grants: { compost?: true; practice?: PracticeId };
  lesson: string;
};

export const MINIGAMES: Record<MinigameId, MinigameRule> = {
  compost: {
    label: 'Gather compost',
    blurb: 'Collect the farm waste before it blows away, then turn the heap.',
    durationMs: 25_000,
    grants: { compost: true },
    lesson:
      'Leaf litter, husks and manure are not waste. Composted, they feed the soil and lock carbon into it. Synthetic nitrogen is made from natural gas.',
  },
  mulch: {
    label: 'Mulch the roots',
    blurb: 'Cover the soil ring before the sun climbs.',
    durationMs: 25_000,
    grants: { practice: 'mulch' },
    lesson: PRACTICES.mulch.lesson,
  },
  haze: {
    label: 'Haze control',
    blurb: 'Put out the embers and bale the residue instead of burning it.',
    durationMs: 30_000,
    grants: { practice: 'noBurn' },
    lesson: PRACTICES.noBurn.lesson,
  },
};
