import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';

import { pool } from '../src/db/pool.ts';
import {
  claimPlot,
  completeMinigamePlot,
  fertilisePlot,
  fillSunPlot,
  gardenStars,
  getGarden,
  plant,
  waterPlot,
} from '../src/garden/service.ts';
import { FERTILISERS } from '../src/shared/index.ts';
import { createUser, setupDb } from './helpers.ts';

after(async () => pool.end());

const HOUR = 3_600_000;
const DAY = 86_400_000;
/** Local noon, so a day's arithmetic never straddles midnight by accident. */
const NOON = new Date(2026, 8, 14, 12).getTime();

async function giveStars(userId: string, stars: number) {
  await pool.query(
    `INSERT INTO star_ledger (user_id, delta, reason, day, note)
     VALUES ($1, $2, 'adjustment', '2026-09-14', 'test fixture')`,
    [userId, Math.round(stars * 100)],
  );
}

describe('garden', () => {
  beforeEach(setupDb);

  it('plants a tree that starts full and is read back settled', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-acacia', NOON);
    assert.equal(plot.statuses.water.level, 1);

    const garden = await getGarden(userId, NOON + HOUR);
    assert.equal(garden.plots.length, 1);
    assert.equal(garden.plots[0]!.id, plot.id);
    assert.equal(garden.carbonAdjustment, 0);
  });

  it('waters, fills the sun once a day, and refuses the second fill', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-acacia', NOON);

    const later = NOON + 20 * HOUR;
    const watered = await waterPlot(userId, plot.id, later);
    assert.equal(watered.statuses.water.level, 1, 'topped back up to full');
    assert.equal(watered.statuses.water.at, later);

    const sunny = await fillSunPlot(userId, plot.id, later);
    assert.equal(sunny.statuses.sun.level, 1);
    await assert.rejects(() => fillSunPlot(userId, plot.id, later + HOUR), /already full/);

    // Midnight passed on the way, so a thriving night is also on the books.
    const { rows } = await pool.query<{ metric: string; amount: string }>(
      "SELECT metric, amount FROM quest_contributions WHERE user_id = $1 AND metric <> 'thrivingNights'",
      [userId],
    );
    assert.deepEqual(rows, [{ metric: 'sunFills', amount: '1' }]);
  });

  it('pays a thriving night as sparkles and books the claim in the star ledger', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-teak', NOON);

    // Midnight is 12 h away: water is at 0.67, everything above its line.
    const nextDay = NOON + 25 * HOUR;
    const garden = await getGarden(userId, nextDay);
    const settled = garden.plots[0]!;
    assert.equal(settled.claimable.length, 1);
    assert.equal(settled.streakDays, 1);

    const before = await gardenStars(userId);
    const result = await claimPlot(userId, plot.id, nextDay);
    assert.equal(result.stars, settled.claimable[0]!.stars);
    assert.equal(result.starsBalance, before + result.stars);
    assert.equal(result.plot.claimable.length, 0);
    await assert.rejects(() => claimPlot(userId, plot.id, nextDay + HOUR), /Nothing to collect/);

    const { rows } = await pool.query<{ reason: string; delta: number }>(
      "SELECT reason, delta FROM star_ledger WHERE user_id = $1 AND reason = 'garden'",
      [userId],
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.delta, Math.round(result.stars * 100));

    const { rows: nights } = await pool.query<{ amount: string }>(
      "SELECT amount FROM quest_contributions WHERE user_id = $1 AND metric = 'thrivingNights'",
      [userId],
    );
    assert.equal(nights[0]!.amount, '1');
  });

  it('charges stars for premium fertiliser and refuses a player who cannot pay', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-mangrove-premium', NOON);
    await assert.rejects(
      () => fertilisePlot(userId, plot.id, 'stars', NOON + HOUR),
      /not have enough stars/,
    );

    await giveStars(userId, 1);
    const price = FERTILISERS.stars.priceStars!;
    const result = await fertilisePlot(userId, plot.id, 'stars', NOON + HOUR);
    assert.equal(result.plot.statuses.soil.level, 1);
    assert.equal(result.starsBalance, 1 - price);

    await assert.rejects(() => fertilisePlot(userId, plot.id, 'compost', NOON + HOUR), /not available/);
  });

  it('runs the low-carbon loop: compost from the minigame, synthetic counted, mulch granted once', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-acacia', NOON);

    const heap = await completeMinigamePlot(userId, plot.id, 'compost', NOON);
    assert.ok(heap.compostMaturesAt);
    await assert.rejects(() => completeMinigamePlot(userId, plot.id, 'compost', NOON + HOUR), /already maturing/);

    // Matures after 12 h; then it can be used.
    const composted = await fertilisePlot(userId, plot.id, 'compost', NOON + 13 * HOUR);
    assert.equal(composted.plot.composts, 1);
    assert.equal(composted.plot.compostReady, 0);

    const synthetic = await fertilisePlot(userId, plot.id, 'synthetic', NOON + 14 * HOUR);
    assert.equal(synthetic.plot.synthetics, 1);

    const mulched = await completeMinigamePlot(userId, plot.id, 'mulch', NOON + 15 * HOUR);
    assert.deepEqual(mulched.practices, ['mulch']);
    await completeMinigamePlot(userId, plot.id, 'mulch', NOON + 16 * HOUR);

    const { rows } = await pool.query<{ metric: string; amount: string }>(
      `SELECT metric, amount FROM quest_contributions
        WHERE user_id = $1 AND metric <> 'thrivingNights' ORDER BY metric`,
      [userId],
    );
    assert.deepEqual(rows, [
      { metric: 'compost', amount: '1' },
      { metric: 'mulch', amount: '1' },
      { metric: 'synthetic', amount: '1' },
    ]);
  });

  it('records a death and refuses care afterwards', async () => {
    const userId = await createUser();
    const plot = await plant(userId, 'seed-acacia', NOON);
    const garden = await getGarden(userId, NOON + 10 * DAY);
    assert.ok(garden.plots[0]!.diedAt);
    await assert.rejects(() => waterPlot(userId, plot.id, NOON + 10 * DAY), /died/);
    const { rows } = await pool.query<{ died_at: string | null }>('SELECT died_at FROM plots WHERE id = $1', [plot.id]);
    assert.ok(rows[0]!.died_at);
  });

  it('keeps one garden apart from another', async () => {
    const a = await createUser();
    const b = await createUser();
    const plot = await plant(a, 'seed-acacia', NOON);
    await assert.rejects(() => waterPlot(b, plot.id, NOON), /not in your garden/);
    assert.equal((await getGarden(b, NOON)).plots.length, 0);
  });
});
