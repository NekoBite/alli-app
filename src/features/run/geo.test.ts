import { haversine, summarizeTrack } from './geo';
import type { GeoPoint } from './types';

const base = { latitude: 13.7563, longitude: 100.5018, timestamp: 0, accuracy: 5 };

describe('haversine', () => {
  it('measures a known short distance', () => {
    // 0.001 degrees of latitude is ~111 m anywhere on Earth.
    const metres = haversine(base, { ...base, latitude: 13.7573 });
    expect(metres).toBeGreaterThan(105);
    expect(metres).toBeLessThan(118);
  });

  it('returns zero for the same point', () => {
    expect(haversine(base, base)).toBe(0);
  });
});

describe('summarizeTrack', () => {
  /** A steady jog: one fix a second, ~11 m apart => ~11 m/s is too fast, so use 0.0001 deg. */
  function steadyTrack(count: number): GeoPoint[] {
    return Array.from({ length: count }, (_, i) => ({
      latitude: 13.7563 + i * 0.0001,
      longitude: 100.5018,
      timestamp: i * 5000,
      accuracy: 6,
    }));
  }

  it('sums distance and moving time over accepted fixes', () => {
    const stats = summarizeTrack(steadyTrack(11));

    // 10 hops of ~11 m.
    expect(stats.distanceMetres).toBeGreaterThan(105);
    expect(stats.distanceMetres).toBeLessThan(118);
    expect(stats.movingSeconds).toBe(50);
    expect(stats.rejectedPoints).toBe(0);
  });

  it('drops fixes with poor accuracy', () => {
    const points = steadyTrack(5);
    points[2] = { ...points[2]!, accuracy: 120 };

    const stats = summarizeTrack(points);
    expect(stats.rejectedPoints).toBe(1);
  });

  it('drops an implausible jump between fixes', () => {
    const points: GeoPoint[] = [
      { ...base, timestamp: 0 },
      // ~1.1 km away one second later.
      { ...base, latitude: 13.7663, timestamp: 1000 },
    ];

    const stats = summarizeTrack(points);
    expect(stats.distanceMetres).toBe(0);
    expect(stats.rejectedPoints).toBe(1);
  });

  it('does not count time spent standing still', () => {
    const points: GeoPoint[] = [
      { ...base, timestamp: 0 },
      // Same spot, 60 s later — below the moving-speed threshold.
      { ...base, timestamp: 60_000 },
    ];

    const stats = summarizeTrack(points);
    expect(stats.movingSeconds).toBe(0);
    expect(stats.distanceMetres).toBe(0);
  });

  it('handles an empty track', () => {
    expect(summarizeTrack([])).toEqual({
      distanceMetres: 0,
      movingSeconds: 0,
      rejectedPoints: 0,
    });
  });
});
