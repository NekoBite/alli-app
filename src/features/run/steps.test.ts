import { creditStepSamples, creditStepWindow, creditSteps, STEP_RULES } from './steps';
import type { StepSample } from './types';

const MAX = STEP_RULES.maxStepsPerMinute;

describe('creditStepWindow', () => {
  it('credits a plausible cadence in full', () => {
    // 120 steps a minute for a minute.
    expect(creditStepWindow({ steps: 120, seconds: 60 })).toEqual({ steps: 120, dropped: 0 });
  });

  it('does not look at GPS: standing in a corridor or walking round a room counts', () => {
    // The window carries a duration and nothing about distance. There is no input that could make a
    // walk worth less because GPS saw no movement.
    expect(creditStepWindow({ steps: 40, seconds: 20 })).toEqual({ steps: 40, dropped: 0 });
  });

  it('cuts a window down to what a person could walk in its duration', () => {
    // 1,000 steps in a minute is not a person.
    expect(creditStepWindow({ steps: 1000, seconds: 60 })).toEqual({ steps: MAX, dropped: 1000 - MAX });
  });

  it('drops only the excess, never the whole window', () => {
    // A delayed sensor callback delivers a burst. The legitimate part still counts.
    const credit = creditStepWindow({ steps: MAX + 40, seconds: 60 });
    expect(credit.steps).toBe(MAX);
    expect(credit.dropped).toBe(40);
  });

  it('treats a very short window as at least the minimum length', () => {
    // Two callbacks a millisecond apart are one moment, not a window with no time in it.
    const floor = Math.floor((STEP_RULES.minWindowSeconds * MAX) / 60);
    expect(creditStepWindow({ steps: 3, seconds: 0 }).steps).toBe(3);
    expect(creditStepWindow({ steps: 1000, seconds: 0 }).steps).toBe(floor);
    expect(creditStepWindow({ steps: 1000, seconds: 0.001 }).steps).toBe(floor);
    expect(creditStepWindow({ steps: 1000, seconds: -5 }).steps).toBe(floor);
    expect(creditStepWindow({ steps: 1000, seconds: Number.NaN }).steps).toBe(floor);
  });

  it('puts no cap on a window with no known start', () => {
    expect(creditStepWindow({ steps: 5000, seconds: Infinity })).toEqual({ steps: 5000, dropped: 0 });
  });

  it('floors fractions and ignores negatives and empty windows', () => {
    expect(creditStepWindow({ steps: 12.9, seconds: 60 }).steps).toBe(12);
    expect(creditStepWindow({ steps: -4, seconds: 60 })).toEqual({ steps: 0, dropped: 0 });
    expect(creditStepWindow({ steps: 0, seconds: 60 })).toEqual({ steps: 0, dropped: 0 });
  });
});

describe('creditSteps', () => {
  it('sums the windows', () => {
    expect(
      creditSteps([
        { steps: 100, seconds: 60 },
        { steps: 90, seconds: 60 },
        { steps: 1000, seconds: 60 },
      ]),
    ).toEqual({ steps: 100 + 90 + MAX, dropped: 1000 - MAX });
  });

  it('has nothing to credit for no windows', () => {
    expect(creditSteps([])).toEqual({ steps: 0, dropped: 0 });
  });
});

describe('creditStepSamples', () => {
  const START = 1_700_000_000_000;
  const at = (seconds: number, steps: number): StepSample => ({ timestamp: START + seconds * 1000, steps });

  it('credits a plausible walk in full, with no track involved', () => {
    // 50 steps every 25 s: 120 a minute.
    const samples = [at(25, 50), at(50, 100), at(75, 150), at(100, 200)];
    expect(creditStepSamples(samples, START)).toEqual({ steps: 200, dropped: 0 });
  });

  it('treats the samples as running totals, not per-window counts', () => {
    // A total that stops climbing means no new steps were taken.
    expect(creditStepSamples([at(25, 50), at(50, 50), at(75, 50)], START)).toEqual({ steps: 50, dropped: 0 });
  });

  it('ignores a total that goes backwards', () => {
    expect(creditStepSamples([at(30, 60), at(60, 10), at(90, 80)], START).steps).toBe(80);
  });

  it('cuts an inflated total down to what the time allows', () => {
    // 100,000 steps claimed a minute in.
    const credit = creditStepSamples([at(60, 100_000)], START);
    expect(credit.steps).toBe(MAX);
    expect(credit.dropped).toBe(100_000 - MAX);
  });

  it('bounds the first window by the run start, so a lone huge sample buys nothing', () => {
    expect(creditStepSamples([at(1, 500_000)], START).steps).toBe(Math.floor((1 * MAX) / 60));
  });

  it('leaves the first window uncapped when the start is unknown', () => {
    expect(creditStepSamples([at(1, 5000)]).steps).toBe(5000);
  });

  it('orders samples by time before windowing them', () => {
    expect(creditStepSamples([at(75, 150), at(25, 50), at(50, 100)], START)).toEqual({ steps: 150, dropped: 0 });
  });

  it('treats a sample stamped before the run began as a minimum-length window, not a negative one', () => {
    const credit = creditStepSamples([at(-10, 4)], START);
    expect(credit.steps).toBe(4);
  });

  it('is the same total however the run was recorded: live windows equal the whole re-credit', () => {
    // The phone credits window by window as readings arrive; the server credits the whole run from
    // the samples. Both must reach the same number or a user is shown one figure and paid another.
    const samples = [at(10, 18), at(20, 40), at(25, 400), at(60, 460), at(120, 620)];
    let previous = START;
    let live = 0;
    let before = 0;
    for (const sample of samples) {
      live += creditStepWindow({ steps: sample.steps - before, seconds: (sample.timestamp - previous) / 1000 }).steps;
      before = sample.steps;
      previous = sample.timestamp;
    }
    expect(live).toBe(creditStepSamples(samples, START).steps);
  });

  it('has nothing to credit without samples', () => {
    expect(creditStepSamples([], START)).toEqual({ steps: 0, dropped: 0 });
  });
});
