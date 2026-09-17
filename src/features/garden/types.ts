import type { TokenSymbol } from '@/services/chain';

/** Standard seeds cost ALLI; premium seeds cost USDT and yield more. */
export type SeedTier = 'standard' | 'premium';

export type Seed = {
  id: string;
  name: string;
  species: string;
  tier: SeedTier;
  /** Currency the seed is bought in: ALLI for standard, USDT for premium. */
  currency: Extract<TokenSymbol, 'ALLI' | 'USDT'>;
  price: number;
  /** Hours from planting to maturity. */
  growthHours: number;
  /** ALLI produced per harvest once mature. */
  yieldAlli: number;
  /** Harvests before the tree is spent. */
  harvestsTotal: number;
  /** Bonus applied to run points while this tree is alive, e.g. 0.05 = +5%. */
  runBonus: number;
  blurb: string;
};

export type PlotStage = 'seed' | 'sprout' | 'sapling' | 'mature' | 'spent';

export type Plot = {
  id: string;
  seedId: string;
  plantedAt: number;
  /** Set when the last harvest is taken. */
  spentAt?: number;
  harvestsTaken: number;
  /** Timestamp of the last harvest, or plantedAt if none yet. */
  lastHarvestAt: number;
  /**
   * Optional link to a real planting — this is what keeps the game honest about
   * being more than a farm sim. Null until a partner confirms a tree is in
   * the ground.
   */
  realTreeRef?: string;
};

export type PlotView = Plot & {
  seed: Seed;
  stage: PlotStage;
  /** 0–1 towards the next harvest. */
  progress: number;
  msUntilHarvest: number;
  harvestable: boolean;
  harvestsRemaining: number;
};
