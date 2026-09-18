import { randomUUID } from 'node:crypto';

import { pool, transaction, type Db } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import { recordContribution } from '../quests/service.ts';
import { starsBalance } from '../run/service.ts';
import {
  adoptPractice,
  calendarConditions,
  carbonMultiplier,
  carbonScore,
  claim,
  dayKey,
  fertilise,
  FERTILISERS,
  fillSun,
  findSeed,
  MINIGAMES,
  newPlot,
  settle,
  startCompost,
  toSparkles,
  water,
  type FertiliserId,
  type Garden,
  type GardenContext,
  type MinigameId,
  type Plot,
} from '../shared/index.ts';

/**
 * The garden, server-side. Every entry point takes the user's row lock,
 * settles every plot to `now` with the shared engine, and only then acts.
 * That ordering is what makes "the level at last midnight" computable from
 * the stored row: nothing moves a plot without settling it first.
 *
 * `now` is a parameter so the tests can walk the clock; callers in routes
 * leave it at the default.
 */

type Seeded = { plot: Plot; seed: NonNullable<ReturnType<typeof findSeed>> };

async function loadPlots(db: Db, userId: string): Promise<Plot[]> {
  const { rows } = await db.query<{ state: Plot }>(
    'SELECT state FROM plots WHERE user_id = $1 ORDER BY planted_at DESC',
    [userId],
  );
  return rows.map((row) => row.state);
}

async function savePlot(db: Db, plot: Plot): Promise<void> {
  await db.query(
    `UPDATE plots SET state = $2, died_at = CASE WHEN $3::bigint IS NULL THEN NULL ELSE to_timestamp($3/1000.0) END,
            updated_at = now()
      WHERE id = $1`,
    [plot.id, JSON.stringify(plot), plot.diedAt ?? null],
  );
}

async function carbonAdjustment(db: Db, userId: string): Promise<number> {
  const { rows } = await db.query<{ carbon_adjustment: number }>(
    'SELECT carbon_adjustment FROM gardens WHERE user_id = $1',
    [userId],
  );
  return rows[0]?.carbon_adjustment ?? 0;
}

/** Lock, settle, act. Every write to a plot goes through here. */
async function withGarden<T>(
  userId: string,
  now: number,
  fn: (db: Db, plots: Plot[], ctx: GardenContext) => Promise<T>,
): Promise<T> {
  return transaction(async (db) => {
    await db.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    const adjustment = await carbonAdjustment(db, userId);
    const stored = await loadPlots(db, userId);
    const ctx: GardenContext = {
      conditions: calendarConditions(now),
      carbonMultiplier: carbonMultiplier(carbonScore(stored, adjustment)),
    };

    let thrivingNights = 0;
    const plots: Plot[] = [];
    for (const plot of stored) {
      const seed = findSeed(plot.seedId);
      if (!seed) {
        plots.push(plot);
        continue;
      }
      const next = settle(plot, seed, ctx, now);
      const known = new Set(plot.claimable.map((c) => c.day));
      thrivingNights += next.claimable.filter((c) => !known.has(c.day)).length;
      if (JSON.stringify(next) !== JSON.stringify(plot)) await savePlot(db, next);
      plots.push(next);
    }
    // A night that paid is a thriving night, which the community quest may count.
    if (thrivingNights > 0) await recordContribution(db, userId, 'thrivingNights', thrivingNights, now);

    return fn(db, plots, ctx);
  });
}

function findPlot(plots: Plot[], plotId: string): Seeded {
  const plot = plots.find((p) => p.id === plotId);
  if (!plot) throw ApiError.notFound('plot_not_found', 'That tree is not in your garden.');
  const seed = findSeed(plot.seedId);
  if (!seed) throw ApiError.notFound('unknown_seed', 'That tree was planted from a seed that no longer exists.');
  return { plot, seed };
}

/** The engine refuses with a plain Error; the client is owed a 400, not a 500. */
function ruled<T>(fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw ApiError.badRequest('garden_rule', (error as Error).message);
  }
}

export async function getGarden(userId: string, now: number = Date.now()): Promise<Garden> {
  return withGarden(userId, now, async (db, plots, ctx) => ({
    plots,
    conditions: ctx.conditions,
    carbonAdjustment: await carbonAdjustment(db, userId),
  }));
}

export async function plant(userId: string, seedId: string, now: number = Date.now()): Promise<Plot> {
  const seed = findSeed(seedId);
  if (!seed) throw ApiError.badRequest('unknown_seed', 'That seed is not in the catalogue.');
  return withGarden(userId, now, async (db) => {
    // TODO: charge seed.price in seed.currency (ALLI or USDT). Payment waits on
    // the custody decision (README §1); until then planting is free.
    const plot = newPlot(randomUUID(), seed, now);
    await db.query(
      `INSERT INTO plots (id, user_id, seed_id, planted_at, state)
       VALUES ($1, $2, $3, to_timestamp($4/1000.0), $5)`,
      [plot.id, userId, seed.id, now, JSON.stringify(plot)],
    );
    await db.query('INSERT INTO gardens (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [userId]);
    return plot;
  });
}

export async function waterPlot(userId: string, plotId: string, now: number = Date.now()): Promise<Plot> {
  return withGarden(userId, now, async (db, plots, ctx) => {
    const { plot, seed } = findPlot(plots, plotId);
    const next = ruled(() => water(plot, seed, ctx.conditions, now));
    await savePlot(db, next);
    return next;
  });
}

/** The phone counted the taps; the server fills the meter once a day. */
export async function fillSunPlot(userId: string, plotId: string, now: number = Date.now()): Promise<Plot> {
  return withGarden(userId, now, async (db, plots, ctx) => {
    const { plot, seed } = findPlot(plots, plotId);
    const next = ruled(() => fillSun(plot, seed, ctx.conditions, now));
    await savePlot(db, next);
    await recordContribution(db, userId, 'sunFills', 1, now);
    return next;
  });
}

export type FertiliseResult = { plot: Plot; starsBalance?: number };

export async function fertilisePlot(
  userId: string,
  plotId: string,
  kind: FertiliserId,
  now: number = Date.now(),
): Promise<FertiliseResult> {
  return withGarden(userId, now, async (db, plots, ctx) => {
    const { plot, seed } = findPlot(plots, plotId);
    const next = ruled(() => fertilise(plot, seed, ctx.conditions, kind, now));
    const rule = FERTILISERS[kind];

    let balance: number | undefined;
    if (rule.priceStars) {
      const held = await starsBalance(db, userId);
      if (held < rule.priceStars) {
        throw ApiError.badRequest('insufficient_stars', 'You do not have enough stars for that.');
      }
      await db.query(
        `INSERT INTO star_ledger (user_id, delta, reason, day, note)
         VALUES ($1, $2, 'garden', $3, $4)`,
        [userId, -toSparkles(rule.priceStars), dayKey(new Date(now)), `${rule.label} · ${seed.name}`],
      );
      balance = await starsBalance(db, userId);
    }
    // TODO: `priceAlli` (synthetic fertiliser) is an ALLI charge that waits on
    // the custody decision. It is recorded against the carbon score regardless.

    await savePlot(db, next);
    if (kind === 'compost') await recordContribution(db, userId, 'compost', 1, now);
    if (kind === 'synthetic') await recordContribution(db, userId, 'synthetic', 1, now);
    return { plot: next, starsBalance: balance };
  });
}

export type ClaimResult = { plot: Plot; stars: number; starsBalance: number };

/** Pays every sparkle on the canopy into the star ledger. */
export async function claimPlot(userId: string, plotId: string, now: number = Date.now()): Promise<ClaimResult> {
  return withGarden(userId, now, async (db, plots) => {
    const { plot, seed } = findPlot(plots, plotId);
    const { plot: next, stars } = claim(plot, now);
    if (stars <= 0) throw ApiError.badRequest('nothing_to_claim', 'Nothing to collect yet.');
    await db.query(
      `INSERT INTO star_ledger (user_id, delta, reason, day, note)
       VALUES ($1, $2, 'garden', $3, $4)`,
      [userId, toSparkles(stars), dayKey(new Date(now)), `Sparkles · ${seed.name}`],
    );
    await savePlot(db, next);
    return { plot: next, stars, starsBalance: await starsBalance(db, userId) };
  });
}

/** A minigame was won: start a compost heap or grant the practice it teaches. Once a day per game. */
export async function completeMinigamePlot(
  userId: string,
  plotId: string,
  game: MinigameId,
  now: number = Date.now(),
): Promise<Plot> {
  return withGarden(userId, now, async (db, plots) => {
    const { plot, seed } = findPlot(plots, plotId);
    const grants = MINIGAMES[game].grants;
    let next = plot;
    if (grants.compost) next = ruled(() => startCompost(next, seed, now));
    if (grants.practice) {
      const fresh = !plot.practices.includes(grants.practice);
      next = ruled(() => adoptPractice(next, seed, grants.practice!));
      if (fresh && grants.practice === 'mulch') await recordContribution(db, userId, 'mulch', 1, now);
      if (fresh && grants.practice === 'noBurn') await recordContribution(db, userId, 'noBurn', 1, now);
    }
    await savePlot(db, next);
    return next;
  });
}

/** For tests and admin tooling: the balance as the ledger sees it. */
export async function gardenStars(userId: string): Promise<number> {
  return starsBalance(pool, userId);
}
