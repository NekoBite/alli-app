import { isMock } from '@/config/env';
import { findSeed } from '@/features/garden/catalog';
import { plotView } from '@/features/garden/growth';
import type { Plot } from '@/features/garden/types';
import { delay, request } from './client';

export interface GardenApi {
  getPlots(): Promise<Plot[]>;
  /** Charges the seed price (ALLI or USDT) and returns the new plot. */
  plant(seedId: string): Promise<Plot>;
  /** Pays out the harvest and returns the updated plot plus the ALLI credited. */
  harvest(plotId: string): Promise<{ plot: Plot; alli: number }>;
}

const live: GardenApi = {
  getPlots: () => request('/v1/garden/plots'),
  plant: (seedId) => request('/v1/garden/plots', { method: 'POST', body: { seedId } }),
  harvest: (plotId) => request(`/v1/garden/plots/${plotId}/harvest`, { method: 'POST' }),
};

const HOUR = 3_600_000;

let mockPlots: Plot[] = [
  {
    id: 'plot-seed-1',
    seedId: 'seed-acacia',
    // Planted 30 h ago with a 24 h cycle, so it is ready to harvest.
    plantedAt: Date.now() - 30 * HOUR,
    lastHarvestAt: Date.now() - 30 * HOUR,
    harvestsTaken: 0,
  },
  {
    id: 'plot-seed-2',
    seedId: 'seed-mangrove-premium',
    plantedAt: Date.now() - 12 * HOUR,
    lastHarvestAt: Date.now() - 12 * HOUR,
    harvestsTaken: 0,
    realTreeRef: 'TH-MANGROVE-2026-0041',
  },
];

const mock: GardenApi = {
  getPlots: () => delay([...mockPlots]),

  async plant(seedId) {
    const seed = findSeed(seedId);
    if (!seed) throw new Error('Unknown seed.');
    const now = Date.now();
    const plot: Plot = {
      id: `plot-${now}`,
      seedId,
      plantedAt: now,
      lastHarvestAt: now,
      harvestsTaken: 0,
    };
    mockPlots = [plot, ...mockPlots];
    return delay(plot, 700);
  },

  async harvest(plotId) {
    const existing = mockPlots.find((plot) => plot.id === plotId);
    if (!existing) throw new Error('Plot not found.');

    const view = plotView(existing);
    if (!view) throw new Error('Unknown seed.');
    if (!view.harvestable) throw new Error('This tree is not ready yet.');

    const now = Date.now();
    const harvestsTaken = existing.harvestsTaken + 1;
    const updated: Plot = {
      ...existing,
      harvestsTaken,
      lastHarvestAt: now,
      spentAt: harvestsTaken >= view.seed.harvestsTotal ? now : undefined,
    };
    mockPlots = mockPlots.map((plot) => (plot.id === plotId ? updated : plot));
    return delay({ plot: updated, alli: view.seed.yieldAlli }, 700);
  },
};

export const gardenApi: GardenApi = isMock ? mock : live;
