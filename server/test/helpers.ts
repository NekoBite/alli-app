import { randomUUID } from 'node:crypto';

import { migrate } from '../src/db/migrate.ts';
import { pool } from '../src/db/pool.ts';
import type { GeoPoint, StepSample } from '../src/shared/run.ts';

let migrated = false;

export async function setupDb(): Promise<void> {
  if (!migrated) {
    await migrate();
    migrated = true;
  }
  // Truncate rather than re-migrate between tests: faster, and CASCADE keeps
  // the foreign keys honest.
  await pool.query(
    `TRUNCATE users, auth_codes, sessions, identities, runs, star_ledger, redemptions,
             plots, gardens, quest_contributions, quest_weeks, quest_payouts,
             credit_ledger, memberships, payment_intents, orders, referral_codes,
             sponsorships, commissions CASCADE`,
  );
}

/**
 * A user who can run: every recorded run spends a credit (docs/architecture.md §2), so test users
 * start with a stack of them unless a test asks for none.
 */
export async function createUser(email = `${randomUUID()}@example.com`, runCredits = 100): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'INSERT INTO users (email) VALUES ($1) RETURNING id',
    [email],
  );
  const id = rows[0]!.id;
  if (runCredits > 0) {
    await pool.query(`INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, $2, 'adjustment')`, [id, runCredits]);
  }
  return id;
}

/**
 * A track that a real runner would produce: fixes 5 s apart, ~14 m each,
 * which is ~2.8 m/s — a believable 6 min/km.
 */
export function goodTrack(points: number, startMs = 1_700_000_000_000): GeoPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: 13.7563 + i * 0.000125,
    longitude: 100.5018,
    timestamp: startMs + i * 5000,
    accuracy: 6,
  }));
}

/** Same shape, but moving far too fast to be on foot. */
export function drivingTrack(points: number, startMs = 1_700_000_000_000): GeoPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: 13.7563 + i * 0.0009,
    longitude: 100.5018,
    timestamp: startMs + i * 5000,
    accuracy: 6,
  }));
}

export const DAY = '2026-09-16';

/** A phone sitting still: fixes keep arriving, the ground never changes. */
export function stationaryTrack(points: number, startMs = 1_700_000_000_000): GeoPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: 13.7563,
    longitude: 100.5018,
    timestamp: startMs + i * 5000,
    accuracy: 6,
  }));
}

/**
 * Pedometer totals to go with a track: `perSample` steps every `every` fixes,
 * reported as a running total the way the real sensor does.
 */
export function stepSamples(
  track: GeoPoint[],
  perSample: number,
  every = 5,
): StepSample[] {
  const samples: StepSample[] = [];
  let total = 0;
  for (let i = every - 1; i < track.length; i += every) {
    total += perSample;
    samples.push({ timestamp: track[i]!.timestamp, steps: total });
  }
  return samples;
}
