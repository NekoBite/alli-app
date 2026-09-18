import { roundStars } from '@/features/run/rewards';
import { dayKey } from '@/utils/time';
import { findSeed } from './catalog';
import { CARE_RULES, CONDITIONS, FERTILISERS, PRACTICES, STATUS_ORDER, STATUS_RULES } from './rules';
import type {
  Condition,
  ConditionId,
  FertiliserId,
  GrowthStage,
  Health,
  Plot,
  PlotView,
  PracticeId,
  Seed,
  StatusId,
  StatusState,
  StatusView,
} from './types';

/**
 * The care engine. Pure: no clock, no storage, no network. Every function
 * takes the moment it is asked about, so the phone previews with the same code
 * the server settles with, and a disputed day can be recomputed from the row.
 *
 * Two ideas hold it together:
 *
 * - A status is stored as (level, at) and decays linearly from there, so the
 *   level at any instant is derived, never stored. A condition or practice
 *   changes the rate, not the representation.
 * - Rewards are decided at each local midnight by `settle`, which has to run
 *   before any action touches a plot. That is what makes "the level at last
 *   midnight" computable from the current row: nothing has moved since.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

// --- days ---------------------------------------------------------------

/** Local midnight that starts a YYYY-MM-DD day. */
export function dayStart(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).getTime();
}

export function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return dayKey(new Date(y!, m! - 1, d! + 1));
}

export function ageDays(plot: Pick<Plot, 'plantedAt'>, at: number): number {
  return Math.max(0, (at - plot.plantedAt) / DAY_MS);
}

export function stageFor(age: number): GrowthStage {
  const { stageDays } = CARE_RULES;
  if (age >= stageDays.tree) return 'tree';
  if (age >= stageDays.sapling) return 'sapling';
  if (age >= stageDays.sprout) return 'sprout';
  return 'seed';
}

// --- conditions and practices ----------------------------------------------

export function conditionsAt(conditions: Condition[], at: number): ConditionId[] {
  return conditions.filter((c) => c.from <= at && at < c.to).map((c) => c.id);
}

/**
 * The conditions a tree actually feels: none on the simple profile, and none
 * it holds the countering practice for.
 */
export function feltConditions(seed: Seed, plot: Plot, active: ConditionId[]): ConditionId[] {
  if (seed.careProfile !== 'lowCarbon') return [];
  return active.filter((id) => !plot.practices.includes(CONDITIONS[id].counteredBy));
}

/** How much faster (>1) or slower (<1) a status decays for this tree right now. */
export function decayFactor(
  statusId: StatusId,
  seed: Seed,
  plot: Plot,
  felt: ConditionId[],
): number {
  if (seed.careProfile !== 'lowCarbon') return 1;
  let factor = 1;
  for (const id of felt) factor *= CONDITIONS[id].decayFactor?.[statusId] ?? 1;
  for (const id of plot.practices) factor *= PRACTICES[id].decayFactor?.[statusId] ?? 1;
  return factor;
}

/** The line a status must stay above for the day to pay. */
export function thresholdFor(
  statusId: StatusId,
  seed: Seed,
  plot: Plot,
  felt: ConditionId[],
): number {
  let threshold = STATUS_RULES[statusId].threshold;
  if (seed.careProfile === 'lowCarbon') {
    for (const id of felt) threshold += CONDITIONS[id].thresholdDelta?.[statusId] ?? 0;
    for (const id of plot.practices) threshold += PRACTICES[id].thresholdDelta?.[statusId] ?? 0;
  }
  return Math.min(0.95, Math.max(0.05, threshold));
}

export function sunTapsNeeded(seed: Seed, felt: ConditionId[]): number {
  let taps: number = CARE_RULES.sunTapsPerFill;
  if (seed.careProfile === 'lowCarbon') {
    for (const id of felt) taps *= CONDITIONS[id].sunTapsFactor ?? 1;
  }
  return Math.round(taps);
}

// --- levels -------------------------------------------------------------

function emptiesMs(statusId: StatusId, factor: number): number {
  return (STATUS_RULES[statusId].emptiesAfterHours * HOUR_MS) / factor;
}

export function levelAt(state: StatusState, statusId: StatusId, factor: number, at: number): number {
  const elapsed = Math.max(0, at - state.at);
  return clamp01(state.level - elapsed / emptiesMs(statusId, factor));
}

/** The instant a status left untouched hits zero (in the past if it already has). */
export function emptyAt(state: StatusState, statusId: StatusId, factor: number): number {
  return state.at + clamp01(state.level) * emptiesMs(statusId, factor);
}

// --- health -------------------------------------------------------------

export function healthAt(plot: Plot, seed: Seed, conditions: Condition[], at: number): Health {
  if (plot.diedAt !== undefined && plot.diedAt <= at) return 'dead';

  const felt = feltConditions(seed, plot, conditionsAt(conditions, at));
  let longestAtZero = 0;
  let below = false;
  for (const id of STATUS_ORDER) {
    const factor = decayFactor(id, seed, plot, felt);
    const empty = emptyAt(plot.statuses[id], id, factor);
    if (empty <= at) longestAtZero = Math.max(longestAtZero, at - empty);
    if (levelAt(plot.statuses[id], id, factor, at) < thresholdFor(id, seed, plot, felt)) {
      below = true;
    }
  }

  if (longestAtZero >= CARE_RULES.dieAfterHoursAtZero * HOUR_MS) return 'dead';
  if (ageDays(plot, at) >= seed.lifetimeDays) return 'retired';
  if (longestAtZero >= CARE_RULES.wiltAfterHoursAtZero * HOUR_MS) return 'wilting';
  return below ? 'stressed' : 'thriving';
}

/** When the tree died, if a status has been at zero long enough by `now`. */
function deathInstant(plot: Plot, seed: Seed, conditions: Condition[], now: number): number | undefined {
  const felt = feltConditions(seed, plot, conditionsAt(conditions, now));
  let died: number | undefined;
  for (const id of STATUS_ORDER) {
    const at = emptyAt(plot.statuses[id], id, decayFactor(id, seed, plot, felt));
    const dies = at + CARE_RULES.dieAfterHoursAtZero * HOUR_MS;
    if (dies <= now && (died === undefined || dies < died)) died = dies;
  }
  return died;
}

// --- rewards ------------------------------------------------------------

/** What a paid day is worth at a given streak length (1 = the first paid day). */
export function rewardFor(seed: Seed, streakDays: number, carbonMultiplier: number): number {
  const streakBonus = Math.min(
    CARE_RULES.streakBonusMax,
    CARE_RULES.streakBonusPerDay * Math.max(0, streakDays - 1),
  );
  const carbon = seed.careProfile === 'lowCarbon' ? carbonMultiplier : 1;
  return roundStars(seed.starsPerDay * (1 + streakBonus) * carbon);
}

/**
 * The garden's carbon score: synthetic fertiliser adds, compost and practices
 * subtract, and `adjustment` carries what community quest rewards have earned.
 */
export function carbonScore(plots: Plot[], adjustment = 0): number {
  let score = adjustment;
  for (const plot of plots) {
    const seed = findSeed(plot.seedId);
    if (!seed || seed.careProfile !== 'lowCarbon') continue;
    score +=
      plot.synthetics * CARE_RULES.carbonPerSynthetic +
      plot.composts * CARE_RULES.carbonPerCompost +
      plot.practices.length * CARE_RULES.carbonPerPractice;
  }
  return score;
}

/** A low score (good) pays more than 1×, a high one less. */
export function carbonMultiplier(score: number): number {
  const raw = 1 - score * CARE_RULES.carbonMultiplierPerPoint;
  return Math.min(CARE_RULES.carbonMultiplierMax, Math.max(CARE_RULES.carbonMultiplierMin, raw));
}

/** How many sparkle objects a claimable amount draws on the canopy. */
export function sparkleObjects(stars: number): number {
  if (stars <= 0) return 0;
  return Math.max(1, Math.min(CARE_RULES.maxSparkles, Math.round(stars / CARE_RULES.starsPerSparkle)));
}

export type GardenContext = { conditions: Condition[]; carbonMultiplier: number };

/**
 * Runs every local midnight the plot has not yet been judged at, in order,
 * and pays or breaks the streak for each. Also matures compost, expires old
 * sparkles and records a death. Idempotent within a day, so it is safe to run
 * before every read and every write.
 */
export function settle(plot: Plot, seed: Seed, ctx: GardenContext, now: number): Plot {
  const next: Plot = { ...plot, claimable: [...plot.claimable] };
  const today = dayKey(new Date(now));

  let day = next.settledDay;
  while (day < today) {
    const following = nextDay(day);
    const midnight = dayStart(following);
    if (midnight > now) break;

    if (healthAt(next, seed, ctx.conditions, midnight) === 'thriving') {
      next.streakDays += 1;
      next.claimable.push({
        day,
        stars: rewardFor(seed, next.streakDays, ctx.carbonMultiplier),
        expiresAt: midnight + CARE_RULES.claimExpiresAfterDays * DAY_MS,
      });
    } else {
      next.streakDays = 0;
    }
    day = following;
  }
  next.settledDay = day;

  next.claimable = next.claimable.filter((c) => c.expiresAt > now);

  if (next.compostMaturesAt !== undefined && next.compostMaturesAt <= now) {
    next.compostReady += 1;
    next.compostMaturesAt = undefined;
  }

  if (next.diedAt === undefined) {
    const died = deathInstant(next, seed, ctx.conditions, now);
    if (died !== undefined) next.diedAt = died;
  }

  return next;
}

// --- actions ------------------------------------------------------------

function assertTendable(plot: Plot, seed: Seed, conditions: Condition[], now: number): void {
  const health = healthAt(plot, seed, conditions, now);
  if (health === 'dead') throw new Error('This tree has died. Plant a new seed.');
  if (health === 'retired') throw new Error('This tree has retired. Plant a new seed.');
}

export function water(plot: Plot, seed: Seed, conditions: Condition[], now: number): Plot {
  assertTendable(plot, seed, conditions, now);
  const felt = feltConditions(seed, plot, conditionsAt(conditions, now));
  const level = levelAt(plot.statuses.water, 'water', decayFactor('water', seed, plot, felt), now);
  return {
    ...plot,
    statuses: { ...plot.statuses, water: { level: clamp01(level + CARE_RULES.waterPerCan), at: now } },
  };
}

/** Fills the sun meter for the day. The taps are counted on the phone; the server accepts one fill a day. */
export function fillSun(plot: Plot, seed: Seed, conditions: Condition[], now: number): Plot {
  assertTendable(plot, seed, conditions, now);
  const today = dayKey(new Date(now));
  if (plot.sunFilledDay === today) throw new Error('The sun meter is already full for today.');
  return {
    ...plot,
    sunFilledDay: today,
    statuses: { ...plot.statuses, sun: { level: 1, at: now } },
  };
}

export function fertilise(
  plot: Plot,
  seed: Seed,
  conditions: Condition[],
  kind: FertiliserId,
  now: number,
): Plot {
  assertTendable(plot, seed, conditions, now);
  const rule = FERTILISERS[kind];
  if (rule.profile !== seed.careProfile) {
    throw new Error(`${rule.label} is not available for this tree.`);
  }
  const next: Plot = { ...plot, statuses: { ...plot.statuses, soil: { level: 1, at: now } } };
  if (kind === 'compost') {
    if (plot.compostReady < 1) throw new Error('No compost is ready yet.');
    next.compostReady = plot.compostReady - 1;
    next.composts = plot.composts + 1;
  }
  if (kind === 'synthetic') next.synthetics = plot.synthetics + 1;
  return next;
}

/** Starts a compost heap maturing. Won in the Gather compost minigame. */
export function startCompost(plot: Plot, seed: Seed, now: number): Plot {
  if (seed.careProfile !== 'lowCarbon') throw new Error('Only low-carbon trees compost.');
  if (plot.compostMaturesAt !== undefined) throw new Error('A heap is already maturing.');
  return { ...plot, compostMaturesAt: now + CARE_RULES.compostMaturesAfterHours * HOUR_MS };
}

export function adoptPractice(plot: Plot, seed: Seed, id: PracticeId): Plot {
  if (seed.careProfile !== 'lowCarbon') throw new Error('Only low-carbon trees adopt practices.');
  if (plot.practices.includes(id)) return plot;
  return { ...plot, practices: [...plot.practices, id] };
}

/** Collects every sparkle on the canopy. The stars land in the ledger server-side. */
export function claim(plot: Plot, now: number): { plot: Plot; stars: number } {
  const live = plot.claimable.filter((c) => c.expiresAt > now);
  const stars = roundStars(live.reduce((sum, c) => sum + c.stars, 0));
  return { plot: { ...plot, claimable: [] }, stars };
}

export function newPlot(id: string, seed: Seed, now: number, realTreeRef?: string): Plot {
  const full: StatusState = { level: 1, at: now };
  return {
    id,
    seedId: seed.id,
    plantedAt: now,
    statuses: { water: { ...full }, sun: { ...full }, soil: { ...full } },
    settledDay: dayKey(new Date(now)),
    claimable: [],
    streakDays: 0,
    compostReady: 0,
    synthetics: 0,
    composts: 0,
    practices: [],
    realTreeRef,
  };
}

// --- views --------------------------------------------------------------

/** Projects a stored plot into everything the UI needs, at time `now`. */
export function plotView(plot: Plot, ctx: GardenContext, now: number = Date.now()): PlotView | null {
  const seed = findSeed(plot.seedId);
  if (!seed) return null;

  const active = conditionsAt(ctx.conditions, now);
  const felt = feltConditions(seed, plot, active);
  const meters: StatusView[] = STATUS_ORDER.map((id) => {
    const factor = decayFactor(id, seed, plot, felt);
    const level = levelAt(plot.statuses[id], id, factor, now);
    const threshold = thresholdFor(id, seed, plot, felt);
    const ms = emptiesMs(id, factor);
    return {
      id,
      label: STATUS_RULES[id].label,
      level,
      threshold,
      ok: level >= threshold,
      msUntilBelow: level > threshold ? (level - threshold) * ms : 0,
      msUntilEmpty: level * ms,
    };
  });

  const age = ageDays(plot, now);
  const claimableStars = roundStars(
    plot.claimable.filter((c) => c.expiresAt > now).reduce((sum, c) => sum + c.stars, 0),
  );
  const multiplier = seed.careProfile === 'lowCarbon' ? ctx.carbonMultiplier : 1;

  return {
    ...plot,
    seed,
    ageDays: age,
    daysLeft: Math.max(0, seed.lifetimeDays - age),
    stage: stageFor(age),
    health: healthAt(plot, seed, ctx.conditions, now),
    meters,
    allAbove: meters.every((m) => m.ok),
    claimableStars,
    sparkles: sparkleObjects(claimableStars),
    sunTapsNeeded: sunTapsNeeded(seed, felt),
    sunFilledToday: plot.sunFilledDay === dayKey(new Date(now)),
    activeConditions: felt,
    nextReward: rewardFor(seed, plot.streakDays + 1, ctx.carbonMultiplier),
    compost: {
      ready: plot.compostReady,
      maturing: plot.compostMaturesAt !== undefined,
      msUntilMature:
        plot.compostMaturesAt === undefined ? 0 : Math.max(0, plot.compostMaturesAt - now),
    },
    carbonMultiplier: multiplier,
  };
}

/**
 * The run-quest multiplier the garden grants: the best bonus among the trees
 * that are thriving right now. A neglected tree gives nothing, which is the
 * point.
 */
export function runMultiplier(views: PlotView[]): number {
  const best = views
    .filter((view) => view.health === 'thriving')
    .reduce((max, view) => Math.max(max, view.seed.runBonus), 0);
  return 1 + best;
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
