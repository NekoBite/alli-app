import { appendBackfill, backfillWindow, mergeFixes } from './reconcile';
import type { GeoPoint, StepSample } from './types';

const START = 1_700_000_000_000;

function fix(second: number): GeoPoint {
  return {
    latitude: 13.7563 + second * 0.0001,
    longitude: 100.5018,
    timestamp: START + second * 1000,
    accuracy: 6,
  };
}

describe('mergeFixes', () => {
  it('returns the track untouched when nothing arrived', () => {
    const track = [fix(0), fix(1)];
    expect(mergeFixes(track, [])).toBe(track);
  });

  it('adds background fixes in timestamp order', () => {
    const merged = mergeFixes([fix(0), fix(1)], [fix(2), fix(3)]);
    expect(merged.map((p) => p.timestamp)).toEqual([0, 1, 2, 3].map((s) => START + s * 1000));
  });

  it('sorts a batch that arrived late', () => {
    const merged = mergeFixes([fix(5)], [fix(2), fix(4), fix(3)]);
    expect(merged.map((p) => p.timestamp)).toEqual([2, 3, 4, 5].map((s) => START + s * 1000));
  });

  it('drops duplicates, so draining a buffer twice is harmless', () => {
    const once = mergeFixes([fix(0), fix(1)], [fix(1), fix(2)]);
    const twice = mergeFixes(once, [fix(1), fix(2)]);

    expect(once).toHaveLength(3);
    expect(twice).toHaveLength(3);
  });
});

describe('backfillWindow', () => {
  const samples: StepSample[] = [{ timestamp: START + 10_000, steps: 40 }];

  it('asks from the last sample to now', () => {
    expect(backfillWindow(samples, START, START + 60_000)).toEqual({
      from: START + 10_000,
      to: START + 60_000,
    });
  });

  it('asks from the start of the run when nothing has been sampled yet', () => {
    expect(backfillWindow([], START, START + 60_000)).toEqual({ from: START, to: START + 60_000 });
  });

  it('asks for nothing when no time has passed', () => {
    expect(backfillWindow(samples, START, START + 10_000)).toBeNull();
  });
});

describe('appendBackfill', () => {
  const samples: StepSample[] = [
    { timestamp: START + 10_000, steps: 40 },
    { timestamp: START + 20_000, steps: 90 },
  ];

  it('continues the running total', () => {
    const next = appendBackfill(samples, { from: START + 20_000, to: START + 80_000, steps: 300 });

    expect(next).toHaveLength(3);
    expect(next[2]).toEqual({ timestamp: START + 80_000, steps: 390 });
  });

  it('starts the total from zero when there is nothing before it', () => {
    const next = appendBackfill([], { from: START, to: START + 80_000, steps: 300 });
    expect(next[0]).toEqual({ timestamp: START + 80_000, steps: 300 });
  });

  it('ignores a backfill of no steps', () => {
    expect(appendBackfill(samples, { from: START, to: START + 80_000, steps: 0 })).toBe(samples);
  });

  it('ignores a span the live subscription already covered', () => {
    // Nothing new: counting it again would double the steps in that window.
    expect(appendBackfill(samples, { from: START, to: START + 20_000, steps: 50 })).toBe(samples);
  });
});
