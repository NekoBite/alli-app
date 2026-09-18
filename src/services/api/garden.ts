import { isMock } from '@/config/env';
import {
  adoptPractice,
  calendarConditions,
  carbonMultiplier,
  carbonScore,
  claim,
  fertilise,
  fillSun,
  healthAt,
  newPlot,
  settle,
  startCompost,
  water,
  type GardenContext,
} from '@/features/garden/care';
import { findSeed } from '@/features/garden/catalog';
import { FERTILISERS, MINIGAMES } from '@/features/garden/rules';
import type { FertiliserId, Garden, MinigameId, Plot } from '@/features/garden/types';
import { delay, request } from './client';
import { mockQuests } from './mockQuests';
import { mockStars } from './mockStars';

export type ClaimResult = { plot: Plot; stars: number; starsBalance: number };
export type FertiliseResult = { plot: Plot; starsBalance?: number };

/**
 * The garden's backend surface. Every call settles the plot first (see
 * `settle` in care.ts) so the daily rollover is judged before anything moves.
 *
 * What is deliberately not here: tap counts, minigame scores, or any client
 * claim about a status level. The phone reports that an action happened; the
 * server decides what it is worth, and it accepts one sun fill and one
 * minigame win per tree per day.
 */
export interface GardenApi {
  getGarden(): Promise<Garden>;
  /** Charges the seed price (ALLI or USDT) and plants it. */
  plant(seedId: string): Promise<Plot>;
  water(plotId: string): Promise<Plot>;
  /** The phone counted the taps; the server fills the meter once a day. */
  fillSun(plotId: string): Promise<Plot>;
  /** Charges stars or ALLI as the fertiliser demands, or spends a compost unit. */
  fertilise(plotId: string, kind: FertiliserId): Promise<FertiliseResult>;
  /** Pays every sparkle on the canopy into the star ledger. */
  claim(plotId: string): Promise<ClaimResult>;
  /** A minigame was won: start a compost heap or grant the practice it teaches. */
  completeMinigame(plotId: string, game: MinigameId): Promise<Plot>;
}

const live: GardenApi = {
  getGarden: () => request('/v1/garden'),
  plant: (seedId) => request('/v1/garden/plots', { method: 'POST', body: { seedId } }),
  water: (plotId) => request(`/v1/garden/plots/${plotId}/water`, { method: 'POST' }),
  fillSun: (plotId) => request(`/v1/garden/plots/${plotId}/sun`, { method: 'POST' }),
  fertilise: (plotId, kind) =>
    request(`/v1/garden/plots/${plotId}/fertilise`, { method: 'POST', body: { kind } }),
  claim: (plotId) => request(`/v1/garden/plots/${plotId}/claim`, { method: 'POST' }),
  completeMinigame: (plotId, game) =>
    request(`/v1/garden/plots/${plotId}/minigames/${game}`, { method: 'POST' }),
};

// --- mock -----------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;

function seedGarden(now: number): Garden {
  const mangrove = findSeed('seed-mangrove-premium')!;
  const acacia = findSeed('seed-acacia')!;

  // A premium tree two weeks in, thriving, with yesterday's sparkles waiting.
  const premium: Plot = {
    ...newPlot('plot-mangrove', mangrove, now - 14 * DAY, 'TH-MANGROVE-2026-0041'),
    statuses: {
      water: { level: 0.9, at: now - 6 * HOUR },
      sun: { level: 1, at: now - 20 * HOUR },
      soil: { level: 0.8, at: now - 2 * DAY },
    },
    streakDays: 5,
    claimable: [{ day: 'yesterday', stars: 0.12, expiresAt: now + 2 * DAY }],
  };

  // A low-carbon tree three days in and thirsty, with a compost unit ready.
  const standard: Plot = {
    ...newPlot('plot-acacia', acacia, now - 3 * DAY),
    statuses: {
      water: { level: 1, at: now - 30 * HOUR },
      sun: { level: 1, at: now - 20 * HOUR },
      soil: { level: 1, at: now - DAY },
    },
    streakDays: 2,
    compostReady: 1,
  };

  return { plots: [standard, premium], conditions: calendarConditions(now), carbonAdjustment: 0 };
}

let mockGarden: Garden = seedGarden(Date.now());

function ctx(): GardenContext {
  return {
    conditions: mockGarden.conditions,
    carbonMultiplier: carbonMultiplier(
      carbonScore(mockGarden.plots, mockQuests.carbonAdjustment()),
    ),
  };
}

/**
 * Settles every plot to now, as the server does before answering anything.
 * A night that paid is a thriving night, which the community quest may count.
 */
function settled(now: number): Garden {
  let thrivingNights = 0;
  mockGarden = {
    ...mockGarden,
    carbonAdjustment: mockQuests.carbonAdjustment(),
    plots: mockGarden.plots.map((plot) => {
      const seed = findSeed(plot.seedId);
      if (!seed) return plot;
      const next = settle(plot, seed, ctx(), now);
      const known = new Set(plot.claimable.map((c) => c.day));
      thrivingNights += next.claimable.filter((c) => !known.has(c.day)).length;
      return next;
    }),
  };
  if (thrivingNights > 0) mockQuests.record('thrivingNights', thrivingNights);
  return mockGarden;
}

function find(plotId: string, now: number): { plot: Plot; seed: NonNullable<ReturnType<typeof findSeed>> } {
  settled(now);
  const plot = mockGarden.plots.find((p) => p.id === plotId);
  if (!plot) throw new Error('Plot not found.');
  const seed = findSeed(plot.seedId);
  if (!seed) throw new Error('Unknown seed.');
  return { plot, seed };
}

function replace(plot: Plot): Plot {
  mockGarden = { ...mockGarden, plots: mockGarden.plots.map((p) => (p.id === plot.id ? plot : p)) };
  return plot;
}

const mock: GardenApi = {
  getGarden: () => delay(structuredClone(settled(Date.now()))),

  async plant(seedId) {
    const seed = findSeed(seedId);
    if (!seed) throw new Error('Unknown seed.');
    const now = Date.now();
    settled(now);
    // TODO: the ALLI or USDT charge happens server-side. Nothing is debited here.
    const plot = newPlot(`plot-${now}`, seed, now);
    mockGarden = { ...mockGarden, plots: [plot, ...mockGarden.plots] };
    return delay(plot, 700);
  },

  async water(plotId) {
    const now = Date.now();
    const { plot, seed } = find(plotId, now);
    return delay(replace(water(plot, seed, mockGarden.conditions, now)), 250);
  },

  async fillSun(plotId) {
    const now = Date.now();
    const { plot, seed } = find(plotId, now);
    const next = replace(fillSun(plot, seed, mockGarden.conditions, now));
    mockQuests.record('sunFills');
    return delay(next, 250);
  },

  async fertilise(plotId, kind) {
    const now = Date.now();
    const { plot, seed } = find(plotId, now);
    const next = fertilise(plot, seed, mockGarden.conditions, kind, now);
    const rule = FERTILISERS[kind];
    let starsBalance: number | undefined;
    if (rule.priceStars) starsBalance = mockStars.debit(rule.priceStars);
    // TODO: `priceAlli` is charged server-side. The mock does not debit ALLI.
    replace(next);
    if (kind === 'compost') mockQuests.record('compost');
    if (kind === 'synthetic') mockQuests.record('synthetic');
    return delay({ plot: next, starsBalance }, 500);
  },

  async claim(plotId) {
    const now = Date.now();
    const { plot } = find(plotId, now);
    const result = claim(plot, now);
    if (result.stars <= 0) throw new Error('Nothing to collect yet.');
    replace(result.plot);
    const starsBalance = mockStars.credit(result.stars);
    return delay({ plot: result.plot, stars: result.stars, starsBalance }, 300);
  },

  async completeMinigame(plotId, game) {
    const now = Date.now();
    const { plot, seed } = find(plotId, now);
    if (healthAt(plot, seed, mockGarden.conditions, now) === 'dead') {
      throw new Error('This tree has died.');
    }
    const grants = MINIGAMES[game].grants;
    let next = plot;
    if (grants.compost) next = startCompost(next, seed, now);
    if (grants.practice) {
      const fresh = !plot.practices.includes(grants.practice);
      next = adoptPractice(next, seed, grants.practice);
      if (fresh && grants.practice === 'mulch') mockQuests.record('mulch');
      if (fresh && grants.practice === 'noBurn') mockQuests.record('noBurn');
    }
    return delay(replace(next), 400);
  },
};

export const gardenApi: GardenApi = isMock ? mock : live;
