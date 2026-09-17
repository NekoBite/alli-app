import { SEEDS } from './catalog';
import { cycleMs, gardenMultiplier, MAX_GARDEN_BONUS, plotView, stageFor } from './growth';
import type { Plot, PlotView } from './types';

const acacia = SEEDS.find((s) => s.id === 'seed-acacia')!;
const ironwood = SEEDS.find((s) => s.id === 'seed-ironwood-premium')!;

const NOW = 1_700_000_000_000;

function plot(overrides: Partial<Plot> = {}): Plot {
  return {
    id: 'plot-1',
    seedId: acacia.id,
    plantedAt: NOW,
    lastHarvestAt: NOW,
    harvestsTaken: 0,
    ...overrides,
  };
}

describe('plotView', () => {
  it('starts as a seed with no progress', () => {
    const view = plotView(plot(), NOW)!;
    expect(view.stage).toBe('seed');
    expect(view.progress).toBe(0);
    expect(view.harvestable).toBe(false);
  });

  it('matures exactly one growth cycle after planting', () => {
    const view = plotView(plot(), NOW + cycleMs(acacia))!;
    expect(view.stage).toBe('mature');
    expect(view.harvestable).toBe(true);
    expect(view.msUntilHarvest).toBe(0);
  });

  it('measures the next cycle from the last harvest, not from planting', () => {
    const harvestedAt = NOW + cycleMs(acacia);
    const view = plotView(
      plot({ harvestsTaken: 1, lastHarvestAt: harvestedAt }),
      harvestedAt + cycleMs(acacia) / 2,
    )!;

    expect(view.progress).toBeCloseTo(0.5, 5);
    expect(view.harvestable).toBe(false);
    expect(view.harvestsRemaining).toBe(acacia.harvestsTotal - 1);
  });

  it('is spent once every harvest is taken', () => {
    const view = plotView(plot({ harvestsTaken: acacia.harvestsTotal }), NOW + cycleMs(acacia))!;
    expect(view.stage).toBe('spent');
    expect(view.harvestable).toBe(false);
    expect(view.harvestsRemaining).toBe(0);
  });

  it('returns null for an unknown seed', () => {
    expect(plotView(plot({ seedId: 'seed-nope' }), NOW)).toBeNull();
  });
});

describe('stageFor', () => {
  it('walks through the stages as progress climbs', () => {
    expect(stageFor(0.1, 3)).toBe('seed');
    expect(stageFor(0.3, 3)).toBe('sprout');
    expect(stageFor(0.7, 3)).toBe('sapling');
    expect(stageFor(1, 3)).toBe('mature');
  });
});

describe('gardenMultiplier', () => {
  const view = (seedId: string, spent = false): PlotView =>
    plotView(
      plot({
        seedId,
        harvestsTaken: spent ? 99 : 0,
      }),
      NOW,
    )!;

  it('is 1 with an empty garden', () => {
    expect(gardenMultiplier([])).toBe(1);
  });

  it('adds each living tree bonus', () => {
    expect(gardenMultiplier([view(acacia.id)])).toBeCloseTo(1 + acacia.runBonus, 5);
  });

  it('ignores spent trees', () => {
    expect(gardenMultiplier([view(acacia.id, true)])).toBe(1);
  });

  it('caps the total bonus', () => {
    const many = Array.from({ length: 10 }, () => view(ironwood.id));
    expect(gardenMultiplier(many)).toBe(1 + MAX_GARDEN_BONUS);
  });
});
