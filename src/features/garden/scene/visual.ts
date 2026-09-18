import type { PlotView } from '../types';

/**
 * What a plot looks like, as opposed to where it is in its harvest cycle.
 *
 * `PlotView.stage` restarts at `seed` after every harvest because `progress`
 * is measured from `lastHarvestAt`. A tree that has already paid out once is
 * still a tree, though — so the scene draws the growth stages only for the
 * first cycle, and after that shows the cycle as fruit ripening on a full
 * tree. That matches the intent in growth.ts: a tree matures once, then
 * produces a harvest every `growthHours`.
 */
export type PlantForm = 'seed' | 'sprout' | 'sapling' | 'tree' | 'spent';

export type PlantVisual = {
  form: PlantForm;
  /** 0–1 towards the next harvest; only meaningful for `tree`. */
  ripeness: number;
  harvestable: boolean;
  premium: boolean;
};

export function visualFor(view: PlotView): PlantVisual {
  const premium = view.seed.tier === 'premium';

  if (view.stage === 'spent') {
    return { form: 'spent', ripeness: 0, harvestable: false, premium };
  }

  const matured = view.harvestsTaken > 0 || view.progress >= 1;
  if (matured) {
    return { form: 'tree', ripeness: view.progress, harvestable: view.harvestable, premium };
  }

  const form: PlantForm =
    view.stage === 'sapling' ? 'sapling' : view.stage === 'sprout' ? 'sprout' : 'seed';
  return { form, ripeness: 0, harvestable: false, premium };
}
