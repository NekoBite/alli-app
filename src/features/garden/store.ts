import { create } from 'zustand';

import { useRunStore } from '@/features/run/store';
import { gardenApi } from '@/services/api';
import { kv, KEYS } from '@/services/storage/kv';
import { dayKey } from '@/utils/time';
import { carbonMultiplier, carbonScore, plotView, runMultiplier, type GardenContext } from './care';
import type { FertiliserId, Garden, MinigameId, Plot, PlotView, Seed } from './types';

/** Taps on each tree today. Client-side only: the server accepts one fill a day. */
type TapLog = { day: string; counts: Record<string, number> };

type GardenState = {
  garden: Garden;
  taps: TapLog;
  loading: boolean;
  /** The plot an action is in flight on, so its buttons can go quiet. */
  busy?: string;
  error?: string;

  refresh: () => Promise<void>;
  /** Buys and plants in one step; payment is settled by the backend. */
  plant: (seed: Seed) => Promise<Plot>;
  water: (plotId: string) => Promise<void>;
  /**
   * One tap on the tree. Counted here; when the count reaches what the tree
   * needs today the server is asked to fill the meter. Returns the new count.
   */
  tap: (plotId: string) => Promise<number>;
  fertilise: (plotId: string, kind: FertiliserId) => Promise<void>;
  /** Collects the sparkles. Returns the stars paid. */
  claim: (plotId: string) => Promise<number>;
  completeMinigame: (plotId: string, game: MinigameId) => Promise<void>;

  /** Derived: plots projected to `now`, newest first. */
  views: (now?: number) => PlotView[];
  tapsFor: (plotId: string) => number;
  carbon: () => { score: number; multiplier: number };
  /** The run-quest multiplier the garden grants right now. */
  multiplier: (now?: number) => number;
};

const EMPTY: Garden = { plots: [], conditions: [] };

function context(garden: Garden): GardenContext {
  return {
    conditions: garden.conditions,
    carbonMultiplier: carbonMultiplier(carbonScore(garden.plots)),
  };
}

function freshTaps(): TapLog {
  return { day: dayKey(), counts: {} };
}

export const useGardenStore = create<GardenState>((set, get) => ({
  garden: EMPTY,
  taps: freshTaps(),
  loading: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      const [garden, stored] = await Promise.all([
        gardenApi.getGarden(),
        kv.get<TapLog>(KEYS.gardenTaps),
      ]);
      const taps = stored && stored.day === dayKey() ? stored : freshTaps();
      set({ garden, taps, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async plant(seed) {
    set({ error: undefined });
    try {
      const plot = await gardenApi.plant(seed.id);
      set((state) => ({ garden: { ...state.garden, plots: [plot, ...state.garden.plots] } }));
      return plot;
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  async water(plotId) {
    await act(plotId, () => gardenApi.water(plotId));
  },

  async tap(plotId) {
    const today = dayKey();
    const log = get().taps.day === today ? get().taps : freshTaps();
    const count = (log.counts[plotId] ?? 0) + 1;
    const taps: TapLog = { day: today, counts: { ...log.counts, [plotId]: count } };
    set({ taps });
    void kv.set(KEYS.gardenTaps, taps);

    const view = get()
      .views()
      .find((v) => v.id === plotId);
    if (view && !view.sunFilledToday && count >= view.sunTapsNeeded) {
      await act(plotId, () => gardenApi.fillSun(plotId));
    }
    return count;
  },

  async fertilise(plotId, kind) {
    await act(plotId, async () => {
      const { plot, starsBalance } = await gardenApi.fertilise(plotId, kind);
      if (starsBalance !== undefined) setStars(starsBalance);
      return plot;
    });
  },

  async claim(plotId) {
    let paid = 0;
    await act(plotId, async () => {
      const { plot, stars, starsBalance } = await gardenApi.claim(plotId);
      paid = stars;
      setStars(starsBalance);
      return plot;
    });
    return paid;
  },

  async completeMinigame(plotId, game) {
    await act(plotId, () => gardenApi.completeMinigame(plotId, game));
  },

  views(now) {
    const { garden } = get();
    const ctx = context(garden);
    return garden.plots
      .map((plot) => plotView(plot, ctx, now))
      .filter((view): view is PlotView => view !== null);
  },

  tapsFor(plotId) {
    const { taps } = get();
    return taps.day === dayKey() ? (taps.counts[plotId] ?? 0) : 0;
  },

  carbon() {
    const score = carbonScore(get().garden.plots);
    return { score, multiplier: carbonMultiplier(score) };
  },

  multiplier(now) {
    return runMultiplier(get().views(now));
  },
}));

/** Runs one server action on a plot and swaps the returned plot in. */
async function act(plotId: string, run: () => Promise<Plot>): Promise<void> {
  const { setState } = useGardenStore;
  setState({ busy: plotId, error: undefined });
  try {
    const plot = await run();
    setState((state) => ({
      busy: undefined,
      garden: {
        ...state.garden,
        plots: state.garden.plots.map((p) => (p.id === plot.id ? plot : p)),
      },
    }));
  } catch (error) {
    setState({ busy: undefined, error: (error as Error).message });
    throw error;
  }
}

/** Stars live in the run store's profile; a garden payout updates the same number. */
function setStars(starsBalance: number): void {
  useRunStore.setState((state) => ({ profile: { ...state.profile, starsBalance } }));
}
