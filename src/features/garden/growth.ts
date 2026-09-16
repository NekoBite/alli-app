import { findSeed } from './catalog';
import type { Plot, PlotStage, PlotView, Seed } from './types';

const HOUR_MS = 3_600_000;

/**
 * A tree matures once, then produces a harvest every `growthHours` after that.
 * All of it derives from `plantedAt` / `lastHarvestAt` — nothing is stored that
 * a clock change could desync, and the server can recompute the same view.
 */
export function cycleMs(seed: Seed): number {
  return seed.growthHours * HOUR_MS;
}

export function stageFor(progress: number, harvestsRemaining: number): PlotStage {
  if (harvestsRemaining <= 0) return 'spent';
  if (progress >= 1) return 'mature';
  if (progress >= 0.6) return 'sapling';
  if (progress >= 0.25) return 'sprout';
  return 'seed';
}

/** Projects a stored plot into everything the UI needs, at time `now`. */
export function plotView(plot: Plot, now: number = Date.now()): PlotView | null {
  const seed = findSeed(plot.seedId);
  if (!seed) return null;

  const harvestsRemaining = Math.max(0, seed.harvestsTotal - plot.harvestsTaken);
  const duration = cycleMs(seed);
  const elapsed = now - plot.lastHarvestAt;
  const progress = harvestsRemaining <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
  const msUntilHarvest = harvestsRemaining <= 0 ? 0 : Math.max(0, duration - elapsed);

  return {
    ...plot,
    seed,
    stage: stageFor(progress, harvestsRemaining),
    progress,
    msUntilHarvest,
    harvestable: harvestsRemaining > 0 && progress >= 1,
    harvestsRemaining,
  };
}

/** Total ALLI a plot will still produce if left to run to the end. */
export function remainingYield(view: PlotView): number {
  return view.harvestsRemaining * view.seed.yieldAlli;
}

/**
 * Combined jogging bonus from every living tree, as a multiplier (1 = none).
 * Capped so a large garden cannot outrun the emission schedule.
 */
export const MAX_GARDEN_BONUS = 0.5;

export function gardenMultiplier(views: PlotView[]): number {
  const bonus = views
    .filter((view) => view.stage !== 'spent')
    .reduce((sum, view) => sum + view.seed.joggingBonus, 0);
  return 1 + Math.min(MAX_GARDEN_BONUS, bonus);
}
