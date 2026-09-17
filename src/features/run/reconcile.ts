import type { GeoPoint, StepSample } from './types';

/**
 * Putting a run back together after the app was not watching.
 *
 * A phone in a pocket stops delivering to a foreground subscription, so a run
 * is recorded by two different mechanisms and has to be reconciled: fixes that
 * the background location task wrote to storage while the screen was off, and —
 * on iOS, where the pedometer subscription dies with the app — the step total
 * the OS kept for us and hands back on request.
 *
 * Pure, so the merge can be tested without a phone: everything here takes the
 * pieces and returns the whole.
 */

/** Steps the OS counted over a span the app did not see. */
export type StepBackfill = {
  /** ms since epoch, exclusive. */
  from: number;
  /** ms since epoch, inclusive. */
  to: number;
  steps: number;
};

/**
 * Merges background fixes into the track.
 *
 * Both sources can report the same fix — the watcher and the task overlap
 * around the moment the app wakes — so duplicates are dropped by timestamp, and
 * the result is sorted because the anti-cheat filters read the track in order
 * and a batch can arrive late.
 */
export function mergeFixes(existing: GeoPoint[], incoming: GeoPoint[]): GeoPoint[] {
  if (incoming.length === 0) return existing;

  const byTimestamp = new Map<number, GeoPoint>();
  for (const point of existing) byTimestamp.set(point.timestamp, point);
  // Later wins on a tie: a fix the task wrote is the same fix, and this keeps
  // the merge idempotent if a buffer is drained twice.
  for (const point of incoming) byTimestamp.set(point.timestamp, point);

  return [...byTimestamp.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/** The span to ask the OS about: from the last thing we saw, up to now. */
export function backfillWindow(
  samples: StepSample[],
  startedAt: number,
  now: number,
): { from: number; to: number } | null {
  const last = samples[samples.length - 1];
  const from = last ? last.timestamp : startedAt;
  if (!Number.isFinite(from) || now <= from) return null;
  return { from, to: now };
}

/**
 * Appends what the OS counted while the app was away, as one more running
 * total.
 *
 * Only ever called for a span the live subscription did not cover, because the
 * two would otherwise count the same steps twice. A backfill that reaches no
 * further than the last sample is discarded for exactly that reason.
 */
export function appendBackfill(samples: StepSample[], backfill: StepBackfill): StepSample[] {
  const steps = Math.max(0, Math.floor(backfill.steps));
  if (steps === 0) return samples;

  const last = samples[samples.length - 1];
  if (last && backfill.to <= last.timestamp) return samples;

  return [...samples, { timestamp: backfill.to, steps: (last?.steps ?? 0) + steps }];
}
