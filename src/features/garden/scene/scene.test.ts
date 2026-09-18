import { SEEDS } from '../catalog';
import { cycleMs, plotView } from '../growth';
import type { Plot, PlotView } from '../types';
import { easeInSine, easeOutBack, easeOutSine } from './easing';
import { hash, hitTest, layoutScene, paintOrder, rand } from './layout';
import { seasonFor } from './palette';
import { grassPath, polygonPath, starPath, trunkPath } from './shapes';
import { visualFor } from './visual';

const acacia = SEEDS.find((s) => s.id === 'seed-acacia')!;
const ironwood = SEEDS.find((s) => s.id === 'seed-ironwood-premium')!;
const NOW = 1_700_000_000_000;

function view(overrides: Partial<Plot> = {}, at = NOW): PlotView {
  const plot: Plot = {
    id: 'plot-1',
    seedId: acacia.id,
    plantedAt: NOW,
    lastHarvestAt: NOW,
    harvestsTaken: 0,
    ...overrides,
  };
  return plotView(plot, at)!;
}

describe('easing', () => {
  it('starts at 0 and ends at 1', () => {
    for (const ease of [easeOutBack, easeInSine, easeOutSine]) {
      expect(ease(0)).toBeCloseTo(0);
      expect(ease(1)).toBeCloseTo(1);
    }
  });

  it('easeOutBack overshoots past 1 on the way in — that is the pop', () => {
    expect(easeOutBack(0.7)).toBeGreaterThan(1);
  });

  it('clamps out-of-range input', () => {
    expect(easeOutBack(2)).toBeCloseTo(1);
    expect(easeInSine(-1)).toBeCloseTo(0);
  });
});

describe('seasonFor', () => {
  it('maps months to meteorological seasons', () => {
    expect(seasonFor(new Date(2026, 0, 15))).toBe('winter');
    expect(seasonFor(new Date(2026, 3, 15))).toBe('spring');
    expect(seasonFor(new Date(2026, 6, 15))).toBe('summer');
    expect(seasonFor(new Date(2026, 8, 18))).toBe('autumn');
    expect(seasonFor(new Date(2026, 11, 1))).toBe('winter');
  });
});

describe('shapes', () => {
  it('builds closed polygon paths', () => {
    const path = polygonPath(0, 0, 10, 4);
    expect(path.startsWith('M10 0')).toBe(true);
    expect(path.endsWith('Z')).toBe(true);
    expect(path.split('L')).toHaveLength(4);
  });

  it('stars alternate between the two radii and point up', () => {
    const path = starPath(0, 0, 5, 10, 5);
    expect(path.startsWith('M0 -10')).toBe(true);
    expect(path.split('L')).toHaveLength(10);
  });

  it('scales the trunk and the grass with g', () => {
    expect(trunkPath(0, 0, 1)).toContain('L14 -200');
    expect(trunkPath(0, 0, 0.5)).toContain('L7 -100');
    expect(grassPath(0, 0, 1, 1)).toContain('L5 -25');
    expect(grassPath(0, 0, 1, -1)).toContain('L-5 -25');
  });
});

describe('visualFor', () => {
  it('follows the growth stages through the first cycle', () => {
    expect(visualFor(view()).form).toBe('seed');
    expect(visualFor(view({}, NOW + cycleMs(acacia) * 0.3)).form).toBe('sprout');
    expect(visualFor(view({}, NOW + cycleMs(acacia) * 0.7)).form).toBe('sapling');
    const mature = visualFor(view({}, NOW + cycleMs(acacia)));
    expect(mature.form).toBe('tree');
    expect(mature.harvestable).toBe(true);
    expect(mature.ripeness).toBe(1);
  });

  it('stays a tree after the first harvest instead of regressing to a seed', () => {
    const afterHarvest = view({ harvestsTaken: 1, lastHarvestAt: NOW }, NOW + cycleMs(acacia) * 0.1);
    expect(afterHarvest.stage).toBe('seed');
    const visual = visualFor(afterHarvest);
    expect(visual.form).toBe('tree');
    expect(visual.ripeness).toBeCloseTo(0.1);
    expect(visual.harvestable).toBe(false);
  });

  it('marks spent trees and premium seeds', () => {
    const spent = visualFor(view({ harvestsTaken: acacia.harvestsTotal }));
    expect(spent.form).toBe('spent');
    const premium = visualFor(view({ seedId: ironwood.id }));
    expect(premium.premium).toBe(true);
  });
});

describe('deterministic randomness', () => {
  it('is stable for the same input and spread for different ones', () => {
    expect(hash('plot-1')).toBe(hash('plot-1'));
    expect(hash('plot-1')).not.toBe(hash('plot-2'));
    const seed = hash('plot-1');
    expect(rand(seed, 1)).toBe(rand(seed, 1));
    expect(rand(seed, 1)).not.toBe(rand(seed, 2));
    for (let i = 0; i < 50; i += 1) {
      const value = rand(seed, i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe('layoutScene', () => {
  const plots = [
    view({ id: 'a', plantedAt: NOW }),
    view({ id: 'b', plantedAt: NOW + 1 }),
    view({ id: 'c', plantedAt: NOW + 2 }),
  ];

  it('keeps every plant inside the canvas, standing on the ground', () => {
    const layout = layoutScene(plots, 360, 240);
    expect(layout.horizon).toBeLessThan(240);
    for (const plant of layout.plants) {
      expect(plant.x).toBeGreaterThan(0);
      expect(plant.x).toBeLessThan(360);
      expect(plant.y).toBeGreaterThanOrEqual(layout.horizon);
      expect(plant.y).toBeLessThanOrEqual(240);
      // A full tree (230 sketch units) must fit above the horizon.
      expect(230 * plant.scale).toBeLessThanOrEqual(layout.horizon);
    }
  });

  it('plants left to right in planting order and keeps positions stable', () => {
    const first = layoutScene(plots, 360, 240);
    const xs = ['a', 'b', 'c'].map((id) => first.plants.find((p) => p.id === id)!.x);
    expect(xs[0]!).toBeLessThan(xs[1]!);
    expect(xs[1]!).toBeLessThan(xs[2]!);

    const shuffled = layoutScene([plots[2]!, plots[0]!, plots[1]!], 360, 240);
    for (const plant of first.plants) {
      expect(shuffled.plants.find((p) => p.id === plant.id)!.x).toBe(plant.x);
    }
  });

  it('copes with an empty garden and a zero-width canvas', () => {
    expect(layoutScene([], 360, 240).plants).toEqual([]);
    expect(layoutScene(plots, 0, 240).plants).toHaveLength(3);
  });

  it('hit-tests taps to the nearest plant and paints back to front', () => {
    const layout = layoutScene(plots, 360, 240);
    const target = layout.plants[1]!;
    const hit = hitTest(layout, target.x, target.y - 10);
    expect(hit?.id).toBe(target.id);
    expect(hitTest(layout, 1, 1)).toBeNull();

    const order = paintOrder(layout).map((p) => p.y);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
