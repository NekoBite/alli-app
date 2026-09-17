import { kv, KEYS } from '@/services/storage/kv';
import type { GeoPoint, StepSample } from './types';

/**
 * The in-progress run, persisted so a run survives the app being closed.
 *
 * A run is long, and phones kill apps: without this, walking out of the app
 * mid-run loses the distance already covered, and the run credit with it. The
 * draft is written locally only — it has no authority. What it holds is the raw
 * track, which the server re-validates on submit exactly as it would a track
 * that never left the phone.
 */
export type RunDraft = {
  id: string;
  startedAt: number;
  /** When this snapshot was written, so a stale draft can be recognised. */
  savedAt: number;
  track: GeoPoint[];
  /** Credited steps so far — see `steps.ts`. */
  steps: number;
  /** Steps the GPS check threw away, kept so the resumed screen still explains itself. */
  droppedSteps: number;
  /** Raw pedometer totals, so a resumed run can still be re-credited server-side. */
  rawSteps: number;
  stepSamples: StepSample[];
  /** Distance at the last pedometer window, so step credit resumes from the right base. */
  metresAtLastStep: number;
  elapsedSeconds: number;
};

/**
 * Older than this and the draft is not a paused run, it is litter. Resuming a
 * day-old track would also hand the reward math a gap it would rightly flag.
 */
export const DRAFT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Minimum gap between writes while a run is live. Every GPS fix would mean an
 * AsyncStorage write a second.
 *
 * TODO: a long run's track is megabytes of JSON, and AsyncStorage is not built
 * for that. Before background location ships, write the track incrementally
 * (SQLite, or an append-only file) instead of re-serialising it each time.
 */
export const DRAFT_SAVE_INTERVAL_MS = 10_000;

export const runDraft = {
  async save(draft: RunDraft): Promise<void> {
    await kv.set(KEYS.runDraft, draft);
  },

  /** The saved run, or null when there is none or it has gone stale. */
  async load(now: number = Date.now()): Promise<RunDraft | null> {
    const draft = await kv.get<RunDraft>(KEYS.runDraft);
    if (!draft) return null;

    if (now - draft.savedAt > DRAFT_MAX_AGE_MS) {
      await kv.remove(KEYS.runDraft);
      return null;
    }
    return draft;
  },

  async clear(): Promise<void> {
    await kv.remove(KEYS.runDraft);
  },
};
