import { calculateReward, pointsToAlli, REWARD_RULES } from './rewards';
import type { GeoPoint } from './types';

/** Minimal track — only its length matters to the GPS-quality check. */
function track(points: number): GeoPoint[] {
  return Array.from({ length: points }, (_, i) => ({
    latitude: 13.7563 + i * 0.0001,
    longitude: 100.5018,
    timestamp: 1_700_000_000_000 + i * 1000,
    accuracy: 8,
  }));
}

const clean = { pointsEarnedToday: 0 };

describe('calculateReward', () => {
  it('awards pointsPerKm for a clean run', () => {
    const reward = calculateReward(
      { distanceMetres: 5000, movingSeconds: 1500, track: track(100) },
      clean,
    );

    expect(reward.flags).toEqual([]);
    expect(reward.points).toBe(500);
    expect(pointsToAlli(reward.points)).toBe(0.5);
  });

  it('rejects a run faster than a human can move', () => {
    // 5 km in 5 minutes = 16.7 m/s.
    const reward = calculateReward(
      { distanceMetres: 5000, movingSeconds: 300, track: track(100) },
      clean,
    );

    expect(reward.flags).toContain('pace-too-fast');
    expect(reward.points).toBe(0);
  });

  it('rejects a run below the minimum distance', () => {
    const reward = calculateReward(
      { distanceMetres: 120, movingSeconds: 90, track: track(10) },
      clean,
    );

    expect(reward.flags).toContain('too-short');
    expect(reward.points).toBe(0);
  });

  it('flags a track where most fixes were discarded', () => {
    const reward = calculateReward(
      { distanceMetres: 4000, movingSeconds: 1200, track: track(10), steps: 3000 },
      { ...clean, rejectedPoints: 40 },
    );

    expect(reward.flags).toContain('poor-gps');
    expect(reward.points).toBe(0);
  });

  it('flags an impossible stride length', () => {
    // 5 km on 500 steps = 10 m per step.
    const reward = calculateReward(
      { distanceMetres: 5000, movingSeconds: 1500, track: track(100), steps: 500 },
      clean,
    );

    expect(reward.flags).toContain('step-mismatch');
    expect(reward.points).toBe(0);
  });

  it('clamps to the daily cap and says so', () => {
    const reward = calculateReward(
      { distanceMetres: 10_000, movingSeconds: 3000, track: track(200) },
      { pointsEarnedToday: REWARD_RULES.dailyPointsCap - 100 },
    );

    expect(reward.grossPoints).toBe(1000);
    expect(reward.points).toBe(100);
    expect(reward.flags).toContain('daily-cap-reached');
  });

  it('applies the server-supplied multiplier', () => {
    const reward = calculateReward(
      { distanceMetres: 3000, movingSeconds: 900, track: track(60) },
      { pointsEarnedToday: 0, multiplier: 1.5 },
    );

    expect(reward.points).toBe(450);
  });
});
