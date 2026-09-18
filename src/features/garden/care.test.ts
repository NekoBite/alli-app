import { dayKey } from '@/utils/time';
import {
  adoptPractice,
  ageDays,
  carbonMultiplier,
  carbonScore,
  claim,
  dayStart,
  fertilise,
  fillSun,
  healthAt,
  levelAt,
  newPlot,
  nextDay,
  plotView,
  rewardFor,
  runMultiplier,
  settle,
  sparkleObjects,
  stageFor,
  startCompost,
  water,
  type GardenContext,
} from './care';
import { SEEDS } from './catalog';
import { CARE_RULES, STATUS_RULES } from './rules';
import type { Condition, Plot } from './types';

const HOUR = 3_600_000;
const DAY = 86_400_000;

const acacia = SEEDS.find((s) => s.id === 'seed-acacia')!;
const teak = SEEDS.find((s) => s.id === 'seed-teak')!;
const ironwood = SEEDS.find((s) => s.id === 'seed-ironwood-premium')!;

/** Local noon, so a day's arithmetic never straddles midnight by accident. */
const NOW = new Date(2026, 8, 18, 12, 0, 0).getTime();

const calm: GardenContext = { conditions: [], carbonMultiplier: 1 };

function plotAt(seed = acacia, at = NOW): Plot {
  return newPlot('plot-1', seed, at);
}

/** A plot whose statuses were all set to `level` at `at`. */
function withLevels(plot: Plot, level: number, at: number): Plot {
  return {
    ...plot,
    statuses: {
      water: { level, at },
      sun: { level, at },
      soil: { level, at },
    },
  };
}

describe('days', () => {
  it('rolls local days forward', () => {
    expect(nextDay('2026-09-18')).toBe('2026-09-19');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(dayKey(new Date(dayStart('2026-09-18')))).toBe('2026-09-18');
  });

  it('maps age to growth stages', () => {
    expect(stageFor(0)).toBe('seed');
    expect(stageFor(CARE_RULES.stageDays.sprout)).toBe('sprout');
    expect(stageFor(CARE_RULES.stageDays.sapling)).toBe('sapling');
    expect(stageFor(CARE_RULES.stageDays.tree)).toBe('tree');
    expect(ageDays(plotAt(), NOW + 2.5 * DAY)).toBeCloseTo(2.5);
  });
});

describe('status decay', () => {
  it('starts full and empties linearly over the rule\'s hours', () => {
    const plot = plotAt();
    const hours = STATUS_RULES.water.emptiesAfterHours;
    expect(levelAt(plot.statuses.water, 'water', 1, NOW)).toBe(1);
    expect(levelAt(plot.statuses.water, 'water', 1, NOW + (hours / 2) * HOUR)).toBeCloseTo(0.5);
    expect(levelAt(plot.statuses.water, 'water', 1, NOW + hours * HOUR)).toBe(0);
    expect(levelAt(plot.statuses.water, 'water', 1, NOW + 2 * hours * HOUR)).toBe(0);
  });

  it('decays faster with a factor above one', () => {
    const plot = plotAt();
    const hours = STATUS_RULES.water.emptiesAfterHours;
    expect(levelAt(plot.statuses.water, 'water', 2, NOW + (hours / 2) * HOUR)).toBe(0);
  });
});

describe('health', () => {
  it('is thriving when every status is above its line', () => {
    expect(healthAt(plotAt(), acacia, [], NOW)).toBe('thriving');
  });

  it('is stressed once a status drops below the line, wilting after two days at zero, dead after five', () => {
    const plot = plotAt();
    const empties = STATUS_RULES.water.emptiesAfterHours * HOUR;
    const belowAt = NOW + empties * (1 - STATUS_RULES.water.threshold) + 1;
    expect(healthAt(plot, acacia, [], belowAt)).toBe('stressed');
    const zeroAt = NOW + empties;
    expect(healthAt(plot, acacia, [], zeroAt + CARE_RULES.wiltAfterHoursAtZero * HOUR)).toBe('wilting');
    expect(healthAt(plot, acacia, [], zeroAt + CARE_RULES.dieAfterHoursAtZero * HOUR)).toBe('dead');
  });

  it('retires at the end of its life', () => {
    const plot = plotAt();
    const kept = withLevels(plot, 1, NOW + acacia.lifetimeDays * DAY);
    expect(healthAt(kept, acacia, [], NOW + acacia.lifetimeDays * DAY)).toBe('retired');
  });
});

describe('settle', () => {
  it('pays one claimable per thriving midnight and grows the streak', () => {
    // Teak, because on the cheapest seed a 10% streak bonus rounds away at
    // sparkle precision: 0.02 × 1.1 is still 0.02 stars.
    const plot = plotAt(teak);
    // Water empties in 36 h, so top everything up just before each midnight.
    let settled = plot;
    for (let day = 1; day <= 3; day += 1) {
      const beforeMidnight = dayStart(nextDay(settled.settledDay)) - HOUR;
      settled = withLevels(settled, 1, beforeMidnight);
      settled = settle(settled, teak, calm, beforeMidnight + 2 * HOUR);
      expect(settled.claimable).toHaveLength(day);
      expect(settled.streakDays).toBe(day);
    }
    expect(settled.claimable[0]!.stars).toBe(rewardFor(teak, 1, 1));
    expect(settled.claimable[2]!.stars).toBe(rewardFor(teak, 3, 1));
    expect(settled.claimable[2]!.stars).toBeGreaterThan(settled.claimable[0]!.stars);
  });

  it('breaks the streak on a midnight below the line and pays nothing for it', () => {
    // Watered 20 h before noon: by the coming midnight water is at 0.11, under
    // the line, and by the next one it is empty.
    let plot = withLevels(plotAt(), 1, NOW - 20 * HOUR);
    plot = { ...plot, streakDays: 4 };
    const settled = settle(plot, acacia, calm, NOW + 2 * DAY);
    expect(settled.claimable).toHaveLength(0);
    expect(settled.streakDays).toBe(0);
    expect(settled.settledDay).toBe(dayKey(new Date(NOW + 2 * DAY)));
  });

  it('is idempotent within a day', () => {
    const plot = withLevels(plotAt(), 1, NOW + 20 * HOUR);
    const once = settle(plot, acacia, calm, NOW + 26 * HOUR);
    const twice = settle(once, acacia, calm, NOW + 27 * HOUR);
    expect(twice.claimable).toEqual(once.claimable);
    expect(twice.streakDays).toBe(once.streakDays);
  });

  it('expires sparkles nobody collected', () => {
    const plot = withLevels(plotAt(), 1, NOW + 20 * HOUR);
    const paid = settle(plot, acacia, calm, NOW + 26 * HOUR);
    expect(paid.claimable).toHaveLength(1);
    const later = settle(paid, acacia, calm, NOW + 26 * HOUR + CARE_RULES.claimExpiresAfterDays * DAY + DAY);
    expect(later.claimable).toHaveLength(0);
  });

  it('records the death and refuses care afterwards', () => {
    const plot = plotAt();
    const dead = settle(plot, acacia, calm, NOW + 30 * DAY);
    expect(dead.diedAt).toBeDefined();
    expect(healthAt(dead, acacia, [], NOW + 30 * DAY)).toBe('dead');
    expect(() => water(dead, acacia, [], NOW + 30 * DAY)).toThrow(/died/);
    // Watering cannot resurrect it: diedAt is sticky.
    expect(healthAt(withLevels(dead, 1, NOW + 30 * DAY), acacia, [], NOW + 30 * DAY)).toBe('dead');
  });

  it('does not pay a retired tree', () => {
    let plot = plotAt();
    const end = NOW + acacia.lifetimeDays * DAY + DAY;
    plot = withLevels({ ...plot, settledDay: dayKey(new Date(end - DAY)) }, 1, end - 2 * HOUR);
    const settled = settle(plot, acacia, calm, end);
    expect(settled.claimable).toHaveLength(0);
  });

  it('matures compost once its time is up', () => {
    const plot = startCompost(plotAt(), acacia, NOW);
    expect(plot.compostMaturesAt).toBe(NOW + CARE_RULES.compostMaturesAfterHours * HOUR);
    const early = settle(plot, acacia, calm, NOW + HOUR);
    expect(early.compostReady).toBe(0);
    const done = settle(plot, acacia, calm, NOW + CARE_RULES.compostMaturesAfterHours * HOUR);
    expect(done.compostReady).toBe(1);
    expect(done.compostMaturesAt).toBeUndefined();
  });
});

describe('actions', () => {
  it('watering adds half a can, capped at full', () => {
    const plot = plotAt();
    const dry = withLevels(plot, 0.2, NOW);
    expect(water(dry, acacia, [], NOW).statuses.water.level).toBeCloseTo(0.2 + CARE_RULES.waterPerCan);
    expect(water(plot, acacia, [], NOW).statuses.water.level).toBe(1);
  });

  it('fills the sun once a day', () => {
    const plot = withLevels(plotAt(), 0.1, NOW);
    const filled = fillSun(plot, acacia, [], NOW);
    expect(filled.statuses.sun.level).toBe(1);
    expect(filled.sunFilledDay).toBe(dayKey(new Date(NOW)));
    expect(() => fillSun(filled, acacia, [], NOW + HOUR)).toThrow(/already full/);
    expect(fillSun(filled, acacia, [], NOW + DAY).statuses.sun.at).toBe(NOW + DAY);
  });

  it('fertilises by profile: stars for simple, compost or synthetic for low-carbon', () => {
    const premium = withLevels(plotAt(ironwood), 0.1, NOW);
    expect(fertilise(premium, ironwood, [], 'stars', NOW).statuses.soil.level).toBe(1);
    expect(() => fertilise(premium, ironwood, [], 'compost', NOW)).toThrow(/not available/);

    const standard = withLevels(plotAt(), 0.1, NOW);
    expect(() => fertilise(standard, acacia, [], 'stars', NOW)).toThrow(/not available/);
    expect(() => fertilise(standard, acacia, [], 'compost', NOW)).toThrow(/No compost/);
    const synthetic = fertilise(standard, acacia, [], 'synthetic', NOW);
    expect(synthetic.synthetics).toBe(1);
    expect(synthetic.statuses.soil.level).toBe(1);

    const composted = fertilise({ ...standard, compostReady: 1 }, acacia, [], 'compost', NOW);
    expect(composted.compostReady).toBe(0);
    expect(composted.composts).toBe(1);
  });

  it('collects every live sparkle at once', () => {
    const plot: Plot = {
      ...plotAt(),
      claimable: [
        { day: '2026-09-16', stars: 0.02, expiresAt: NOW + DAY },
        { day: '2026-09-17', stars: 0.03, expiresAt: NOW + 2 * DAY },
        { day: '2026-09-10', stars: 5, expiresAt: NOW - DAY },
      ],
    };
    const { plot: after, stars } = claim(plot, NOW);
    expect(stars).toBe(0.05);
    expect(after.claimable).toEqual([]);
  });
});

describe('low-carbon conditions and practices', () => {
  const heatwave: Condition[] = [{ id: 'heatwave', from: NOW - DAY, to: NOW + 5 * DAY }];
  const haze: Condition[] = [{ id: 'haze', from: NOW - DAY, to: NOW + 5 * DAY }];

  it('raises the water line for a low-carbon tree in a heatwave, not for a simple one', () => {
    const standard = plotView(plotAt(), { conditions: heatwave, carbonMultiplier: 1 }, NOW)!;
    const premium = plotView(plotAt(ironwood), { conditions: heatwave, carbonMultiplier: 1 }, NOW)!;
    const waterLine = (view: typeof standard) => view.meters.find((m) => m.id === 'water')!.threshold;
    expect(waterLine(standard)).toBeCloseTo(STATUS_RULES.water.threshold + 0.25);
    expect(waterLine(premium)).toBe(STATUS_RULES.water.threshold);
    expect(standard.activeConditions).toEqual(['heatwave']);
    expect(premium.activeConditions).toEqual([]);
  });

  it('mulch makes the tree immune to the heatwave', () => {
    const mulched = adoptPractice(plotAt(), acacia, 'mulch');
    const view = plotView(mulched, { conditions: heatwave, carbonMultiplier: 1 }, NOW)!;
    expect(view.activeConditions).toEqual([]);
    expect(view.meters.find((m) => m.id === 'water')!.threshold).toBe(STATUS_RULES.water.threshold);
  });

  it('haze raises the taps a sun fill needs until the no-burn pledge is taken', () => {
    const view = plotView(plotAt(), { conditions: haze, carbonMultiplier: 1 }, NOW)!;
    expect(view.sunTapsNeeded).toBe(150);
    const pledged = adoptPractice(plotAt(), acacia, 'noBurn');
    expect(plotView(pledged, { conditions: haze, carbonMultiplier: 1 }, NOW)!.sunTapsNeeded).toBe(100);
    expect(plotView(plotAt(ironwood), { conditions: haze, carbonMultiplier: 1 }, NOW)!.sunTapsNeeded).toBe(100);
  });

  it('scores carbon across low-carbon trees only and turns it into a multiplier', () => {
    const dirty = { ...plotAt(), synthetics: 4 };
    const clean = { ...plotAt(), composts: 2, practices: ['mulch' as const] };
    const premium = { ...plotAt(ironwood), synthetics: 10 };
    expect(carbonScore([dirty])).toBe(4);
    expect(carbonScore([clean])).toBe(-3);
    expect(carbonScore([dirty, clean, premium])).toBe(1);
    expect(carbonMultiplier(0)).toBe(1);
    expect(carbonMultiplier(4)).toBeCloseTo(0.8);
    expect(carbonMultiplier(-4)).toBeCloseTo(1.2);
    expect(carbonMultiplier(100)).toBe(CARE_RULES.carbonMultiplierMin);
  });

  it('applies the carbon multiplier to low-carbon rewards only', () => {
    expect(rewardFor(acacia, 1, 1.2)).toBeCloseTo(acacia.starsPerDay * 1.2, 2);
    expect(rewardFor(ironwood, 1, 1.2)).toBe(ironwood.starsPerDay);
  });
});

describe('views', () => {
  it('reports sparkles, the next reward and the run multiplier', () => {
    const plot: Plot = {
      ...plotAt(),
      streakDays: 2,
      claimable: [{ day: '2026-09-17', stars: 0.2, expiresAt: NOW + DAY }],
    };
    const view = plotView(plot, calm, NOW)!;
    expect(view.claimableStars).toBe(0.2);
    expect(view.sparkles).toBe(4);
    expect(view.nextReward).toBe(rewardFor(acacia, 3, 1));
    expect(view.health).toBe('thriving');
    expect(runMultiplier([view])).toBeCloseTo(1 + acacia.runBonus);

    const wilted = plotView(withLevels(plot, 0, NOW - 3 * DAY), calm, NOW)!;
    expect(wilted.health).toBe('wilting');
    expect(runMultiplier([wilted])).toBe(1);
  });

  it('caps sparkle objects', () => {
    expect(sparkleObjects(0)).toBe(0);
    expect(sparkleObjects(0.01)).toBe(1);
    expect(sparkleObjects(10)).toBe(CARE_RULES.maxSparkles);
  });
});
