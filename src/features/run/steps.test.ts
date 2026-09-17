import { creditStepSamples, creditStepWindow, creditSteps, goalProgress, STEP_RULES } from './steps';
import type { GeoPoint, StepSample } from './types';

describe('creditStepWindow', () => {
  it('credits steps the distance supports', () => {
    // 20 m at 0.3 m/step supports 66 steps, so 40 reported all count.
    expect(creditStepWindow({ steps: 40, metres: 20 })).toEqual({ steps: 40, dropped: 0 });
  });

  it('drops every step when GPS shows no movement — the shaken phone', () => {
    expect(creditStepWindow({ steps: 120, metres: 0 })).toEqual({ steps: 0, dropped: 120 });
  });

  it('drops a window that moved less than the floor', () => {
    const window = { steps: 30, metres: STEP_RULES.minWindowMetres - 0.01 };
    expect(creditStepWindow(window)).toEqual({ steps: 0, dropped: 30 });
  });

  it('caps steps at what the distance could physically hold', () => {
    // 3 m supports 10 steps at 0.3 m each; the other 90 are not real.
    expect(creditStepWindow({ steps: 100, metres: 3 })).toEqual({ steps: 10, dropped: 90 });
  });

  it('treats no steps as nothing to credit or drop', () => {
    expect(creditStepWindow({ steps: 0, metres: 50 })).toEqual({ steps: 0, dropped: 0 });
  });
});

describe('creditSteps', () => {
  it('sums windows, keeping the dropped ones visible', () => {
    expect(
      creditSteps([
        { steps: 40, metres: 20 },
        { steps: 60, metres: 0 },
        { steps: 100, metres: 3 },
      ]),
    ).toEqual({ steps: 50, dropped: 150 });
  });

  it('is zero for an empty run', () => {
    expect(creditSteps([])).toEqual({ steps: 0, dropped: 0 });
  });
});

describe('goalProgress', () => {
  it('reports a fraction of the goal', () => {
    expect(goalProgress(50, 200)).toBe(0.25);
  });

  it('clamps past the goal and below zero', () => {
    expect(goalProgress(400, 200)).toBe(1);
    expect(goalProgress(-10, 200)).toBe(0);
  });
});

describe('creditStepSamples', () => {
  const START = 1_700_000_000_000;

  /** Fixes 5 s apart, ~13.9 m each — a 2.8 m/s jog. */
  function movingTrack(points: number): GeoPoint[] {
    return Array.from({ length: points }, (_, i) => ({
      latitude: 13.7563 + i * 0.000125,
      longitude: 100.5018,
      timestamp: START + i * 5000,
      accuracy: 6,
    }));
  }

  /** Same fixes, same times, but the phone never leaves the spot. */
  function stillTrack(points: number): GeoPoint[] {
    return Array.from({ length: points }, (_, i) => ({
      latitude: 13.7563,
      longitude: 100.5018,
      timestamp: START + i * 5000,
      accuracy: 6,
    }));
  }

  /** Running totals, `perSample` steps every 5 fixes. */
  function samples(track: GeoPoint[], perSample: number): StepSample[] {
    const out: StepSample[] = [];
    let total = 0;
    for (let i = 4; i < track.length; i += 5) {
      total += perSample;
      out.push({ timestamp: track[i]!.timestamp, steps: total });
    }
    return out;
  }

  it('credits a plausible cadence in full', () => {
    const track = movingTrack(21);
    // 4 windows of 50 steps over ~69 m each.
    expect(creditStepSamples(track, samples(track, 50))).toEqual({ steps: 200, dropped: 0 });
  });

  it('credits nothing to a phone that never moved', () => {
    const track = stillTrack(21);
    expect(creditStepSamples(track, samples(track, 50)).steps).toBe(0);
  });

  it('cuts an inflated total down to what the ground supports', () => {
    const track = movingTrack(21);
    const credit = creditStepSamples(track, samples(track, 100_000));

    expect(credit.steps).toBeGreaterThan(0);
    expect(credit.steps).toBeLessThan(1000);
    expect(credit.dropped).toBeGreaterThan(credit.steps);
  });

  it('treats the samples as running totals, not per-window counts', () => {
    const track = movingTrack(21);
    const flat: StepSample[] = [
      { timestamp: START + 4 * 5000, steps: 50 },
      { timestamp: START + 9 * 5000, steps: 50 },
      { timestamp: START + 14 * 5000, steps: 50 },
    ];
    // A total that stops climbing means no new steps were taken.
    expect(creditStepSamples(track, flat)).toEqual({ steps: 50, dropped: 0 });
  });

  it('ignores a total that goes backwards', () => {
    const track = movingTrack(21);
    const rewound: StepSample[] = [
      { timestamp: START + 4 * 5000, steps: 60 },
      { timestamp: START + 9 * 5000, steps: 10 },
      { timestamp: START + 14 * 5000, steps: 80 },
    ];
    expect(creditStepSamples(track, rewound).steps).toBe(80);
  });

  it('has nothing to credit without samples', () => {
    expect(creditStepSamples(movingTrack(21), [])).toEqual({ steps: 0, dropped: 0 });
  });
});
