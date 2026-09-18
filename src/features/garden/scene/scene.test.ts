import { newPlot, plotView } from '../care';
import { SEEDS } from '../catalog';
import type { Plot } from '../types';
import { easeInSine, easeOutBack, easeOutSine } from './easing';
import { seasonFor } from './palette';
import { grassPath, polygonPath, starPath, trunkPath } from './shapes';
import {
  hash,
  hitPlant,
  hitSparkle,
  layoutStage,
  petalFor,
  rand,
  sparkleSpots,
  starPointsFor,
} from './stage';
import { visualFor } from './visual';

const acacia = SEEDS.find((s) => s.id === 'seed-acacia')!;
const NOW = new Date(2026, 8, 18, 12).getTime();
const DAY = 86_400_000;
const calm = { conditions: [], carbonMultiplier: 1 };

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
});

describe('seasonFor', () => {
  it('maps months to meteorological seasons', () => {
    expect(seasonFor(new Date(2026, 0, 15))).toBe('winter');
    expect(seasonFor(new Date(2026, 3, 15))).toBe('spring');
    expect(seasonFor(new Date(2026, 6, 15))).toBe('summer');
    expect(seasonFor(new Date(2026, 8, 18))).toBe('autumn');
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
  it('follows age for the form and care for the health', () => {
    const plot = newPlot('p', acacia, NOW);
    expect(visualFor(plotView(plot, calm, NOW)!).form).toBe('seed');
    expect(visualFor(plotView(plot, calm, NOW + 3 * DAY)!).form).toBe('sprout');
    const grown: Plot = {
      ...plot,
      statuses: {
        water: { level: 1, at: NOW + 14 * DAY },
        sun: { level: 1, at: NOW + 14 * DAY },
        soil: { level: 1, at: NOW + 14 * DAY },
      },
    };
    const tree = visualFor(plotView(grown, calm, NOW + 14 * DAY)!);
    expect(tree.form).toBe('tree');
    expect(tree.health).toBe('thriving');
  });

  it('hides sparkles on a dead tree', () => {
    const plot: Plot = {
      ...newPlot('p', acacia, NOW),
      diedAt: NOW + DAY,
      claimable: [{ day: 'd', stars: 0.5, expiresAt: NOW + 9 * DAY }],
    };
    const visual = visualFor(plotView(plot, calm, NOW + 2 * DAY)!);
    expect(visual.health).toBe('dead');
    expect(visual.sparkles).toBe(0);
  });
});

describe('stage layout', () => {
  const layout = layoutStage(360, 320);

  it('stands the plant on the ground, centred, with a full tree fitting above the horizon', () => {
    expect(layout.plant.x).toBe(180);
    expect(layout.plant.y).toBeGreaterThanOrEqual(layout.horizon);
    expect(layout.plant.y).toBeLessThan(320);
    expect(230 * layout.plant.scale).toBeLessThanOrEqual(layout.horizon);
  });

  it('places as many sparkles as asked, up to the spots it has, inside the canvas', () => {
    expect(sparkleSpots(layout, 'tree', 0)).toHaveLength(0);
    expect(sparkleSpots(layout, 'tree', 3)).toHaveLength(3);
    expect(sparkleSpots(layout, 'seed', 20)).toHaveLength(8);
    for (const spot of sparkleSpots(layout, 'tree', 8)) {
      expect(spot.x).toBeGreaterThan(0);
      expect(spot.x).toBeLessThan(360);
      expect(spot.y).toBeGreaterThan(0);
      expect(spot.y).toBeLessThan(layout.plant.y);
    }
  });

  it('hit-tests sparkles and the plant', () => {
    const spots = sparkleSpots(layout, 'tree', 3);
    const target = spots[1]!;
    expect(hitSparkle(spots, target.x + 3, target.y - 3)?.index).toBe(1);
    expect(hitSparkle(spots, 5, 5)).toBeNull();
    expect(hitPlant(layout, 'tree', layout.plant.x, layout.plant.y - 50)).toBe(true);
    expect(hitPlant(layout, 'seed', layout.plant.x, layout.plant.y - 20)).toBe(true);
    expect(hitPlant(layout, 'seed', 5, 5)).toBe(false);
  });
});

describe('deterministic randomness', () => {
  it('is stable for the same plot and spread for different ones', () => {
    expect(hash('plot-1')).toBe(hash('plot-1'));
    expect(hash('plot-1')).not.toBe(hash('plot-2'));
    expect(petalFor('plot-1')).toBe(petalFor('plot-1'));
    expect(petalFor('plot-1')).not.toBe(petalFor('plot-2'));
    expect(starPointsFor('plot-1')).toBeGreaterThanOrEqual(5);
    expect(starPointsFor('plot-1')).toBeLessThanOrEqual(8);
    for (let i = 0; i < 50; i += 1) {
      const value = rand(hash('x'), i);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
