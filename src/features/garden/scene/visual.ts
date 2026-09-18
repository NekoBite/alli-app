import type { GrowthStage, Health, PlotView } from '../types';

/**
 * What a plot looks like: its growth stage from its age, its health from its
 * care, and the sparkles waiting on it. Everything else on the canvas is
 * derived from these four fields.
 */
export type PlantVisual = {
  form: GrowthStage;
  health: Health;
  premium: boolean;
  sparkles: number;
};

export function visualFor(view: PlotView): PlantVisual {
  return {
    form: view.stage,
    health: view.health,
    premium: view.seed.tier === 'premium',
    sparkles: view.health === 'dead' ? 0 : view.sparkles,
  };
}
