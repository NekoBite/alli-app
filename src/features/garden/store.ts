import { create } from 'zustand';

import { gardenApi } from '@/services/api';
import { gardenMultiplier, plotView } from './growth';
import type { Plot, PlotView, Seed } from './types';

type GardenState = {
  plots: Plot[];
  loading: boolean;
  planting: boolean;
  error?: string;

  refresh: () => Promise<void>;
  /** Buys and plants in one step; payment is settled by the backend. */
  plant: (seed: Seed) => Promise<void>;
  harvest: (plotId: string) => Promise<number>;

  /** Derived: plots projected to `now`, newest first. */
  views: (now?: number) => PlotView[];
  multiplier: (now?: number) => number;
};

export const useGardenStore = create<GardenState>((set, get) => ({
  plots: [],
  loading: false,
  planting: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      set({ plots: await gardenApi.getPlots(), loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async plant(seed) {
    set({ planting: true, error: undefined });
    try {
      const plot = await gardenApi.plant(seed.id);
      set((state) => ({ plots: [plot, ...state.plots], planting: false }));
    } catch (error) {
      set({ planting: false, error: (error as Error).message });
      throw error;
    }
  },

  async harvest(plotId) {
    const { plot, alli } = await gardenApi.harvest(plotId);
    set((state) => ({ plots: state.plots.map((p) => (p.id === plot.id ? plot : p)) }));
    return alli;
  },

  views(now) {
    return get()
      .plots.map((plot) => plotView(plot, now))
      .filter((view): view is PlotView => view !== null);
  },

  multiplier(now) {
    return gardenMultiplier(get().views(now));
  },
}));
