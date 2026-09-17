import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import * as Location from 'expo-location';
import { Pedometer } from 'expo-sensors';

import { useMockSensors } from '@/config/env';
import {
  clearBackgroundFixes,
  drainBackgroundFixes,
  startBackgroundLocation,
  stopBackgroundLocation,
  type BackgroundStatus,
} from './background';
import { DRAFT_SAVE_INTERVAL_MS, runDraft, type RunDraft } from './draft';
import { averageSpeed, summarizeTrack } from './geo';
import { appendBackfill, backfillWindow, mergeFixes } from './reconcile';
import { creditStepSamples, creditStepWindow } from './steps';
import type { GeoPoint, RunStatus, StepSample } from './types';

/** How often the OS should hand us a fix while a run is active. */
const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 5,
};

/**
 * Mock cadence: each synthesised fix is ~14 m and 5 s further on — a 2.8 m/s
 * jog — but they arrive every 250 ms of wall clock, so the run plays at 20×.
 * Without that, the 6,000-step quest would take half an hour to demonstrate.
 * The session clock follows the synthesised one, so pace, stride and the step
 * windows all stay internally consistent.
 */
const MOCK_TICK_MS = 250;
const MOCK_TICK_SECONDS = 5;
const MOCK_STEPS_PER_TICK = 17;

export type PedometerState = 'unknown' | 'available' | 'unavailable';

export type RunSessionState = {
  /** Stable for the life of the run, including across a resume. */
  id: string;
  startedAt: number;
  status: RunStatus;
  track: GeoPoint[];
  distanceMetres: number;
  /** Wall-clock seconds since start, excluding paused time. */
  elapsedSeconds: number;
  movingSeconds: number;
  /** Current pace source: m/s over moving time. */
  speedMps: number;
  rejectedPoints: number;
  /** Steps the GPS check backed — the number the run is judged on. */
  steps: number;
  /** Steps the pedometer reported that GPS did not back. */
  droppedSteps: number;
  /** Everything the pedometer reported, for the server to re-credit. */
  rawSteps: number;
  stepSamples: StepSample[];
  /** Distance at the last pedometer window; the base for the next one. */
  metresAtLastStep: number;
  permission: 'unknown' | 'granted' | 'denied';
  pedometer: PedometerState;
  /**
   * Whether the run keeps recording once the app is off screen. `denied` means
   * the run works, but only while the screen is on — which the screen says.
   */
  background: BackgroundStatus | 'off';
  /** True when this run was picked up from a saved draft rather than started fresh. */
  resumedFromDraft: boolean;
  error?: string;
};

const INITIAL: RunSessionState = {
  id: '',
  startedAt: 0,
  status: 'idle',
  track: [],
  distanceMetres: 0,
  elapsedSeconds: 0,
  movingSeconds: 0,
  speedMps: 0,
  rejectedPoints: 0,
  steps: 0,
  droppedSteps: 0,
  rawSteps: 0,
  stepSamples: [],
  metresAtLastStep: 0,
  permission: 'unknown',
  pedometer: 'unknown',
  background: 'off',
  resumedFromDraft: false,
};

function newRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function fromDraft(draft: RunDraft): RunSessionState {
  const stats = summarizeTrack(draft.track);
  return {
    ...INITIAL,
    id: draft.id,
    startedAt: draft.startedAt,
    status: 'paused',
    track: draft.track,
    distanceMetres: stats.distanceMetres,
    movingSeconds: stats.movingSeconds,
    rejectedPoints: stats.rejectedPoints,
    speedMps: averageSpeed(stats.distanceMetres, stats.movingSeconds),
    elapsedSeconds: draft.elapsedSeconds,
    steps: draft.steps,
    droppedSteps: draft.droppedSteps,
    rawSteps: draft.rawSteps,
    stepSamples: draft.stepSamples,
    metresAtLastStep: draft.metresAtLastStep,
    resumedFromDraft: true,
  };
}

function toDraft(state: RunSessionState): RunDraft {
  return {
    id: state.id,
    startedAt: state.startedAt,
    savedAt: Date.now(),
    track: state.track,
    steps: state.steps,
    droppedSteps: state.droppedSteps,
    rawSteps: state.rawSteps,
    stepSamples: state.stepSamples,
    metresAtLastStep: state.metresAtLastStep,
    elapsedSeconds: state.elapsedSeconds,
  };
}

/**
 * Owns one live run: permissions, the GPS and pedometer subscriptions, the
 * derived stats, and the draft that lets a run be picked up again later.
 *
 * Steps are credited against GPS movement rather than taken at face value —
 * `creditStepWindow` is what makes shaking the phone worthless. The run's
 * completion (and so its star) hangs on that number.
 *
 * With `EXPO_PUBLIC_MOCK_SENSORS=on` both sensors are synthesised so the screen
 * can be developed on a simulator. That flag is separate from the API's
 * `EXPO_PUBLIC_DATA_SOURCE` on purpose: real GPS against the mock API is the
 * combination you want when walking around the block with an unfinished backend.
 *
 * TODO (before release): a foreground-service task via expo-task-manager, so a
 * run keeps recording when the screen locks. Without it iOS suspends the app and
 * the track ends mid-run — the draft softens that, it does not fix it.
 */
export function useRunSession() {
  const [state, setState] = useState<RunSessionState>(INITIAL);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const stepSubscription = useRef<Pedometer.Subscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockTicker = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Cumulative steps already consumed from the current pedometer subscription. */
  const consumedSteps = useRef(0);
  const lastSavedAt = useRef(0);
  /** The last committed state, for callbacks that need it without re-binding. */
  const latest = useRef(state);

  const addPoint = useCallback((point: GeoPoint) => {
    setState((prev) => {
      if (prev.status !== 'running') return prev;
      const track = [...prev.track, point];
      const stats = summarizeTrack(track);
      return {
        ...prev,
        track,
        distanceMetres: stats.distanceMetres,
        movingSeconds: stats.movingSeconds,
        rejectedPoints: stats.rejectedPoints,
        speedMps: averageSpeed(stats.distanceMetres, stats.movingSeconds),
      };
    });
  }, []);

  /**
   * `reported` is the pedometer's running total for the current subscription.
   * `timestamp` has to come from the same clock as the track, or the server's
   * re-credit pairs each window with the wrong stretch of ground.
   */
  const addSteps = useCallback((reported: number, timestamp: number = Date.now()) => {
    const delta = Math.max(0, Math.floor(reported) - consumedSteps.current);
    if (delta === 0) return;
    consumedSteps.current = Math.floor(reported);

    setState((prev) => {
      if (prev.status !== 'running') return prev;
      const credit = creditStepWindow({
        steps: delta,
        metres: prev.distanceMetres - prev.metresAtLastStep,
      });
      const rawSteps = prev.rawSteps + delta;
      return {
        ...prev,
        steps: prev.steps + credit.steps,
        droppedSteps: prev.droppedSteps + credit.dropped,
        rawSteps,
        // The running total, not the window: the server pairs each sample with
        // the ground covered since the previous one and re-credits from there.
        stepSamples: [...prev.stepSamples, { timestamp, steps: rawSteps }],
        metresAtLastStep: prev.distanceMetres,
      };
    });
  }, []);

  /**
   * (Re)subscribes to the pedometer, counting from zero.
   *
   * Restarting it is how a backfill stays honest: iOS hands back the steps it
   * counted while the app was suspended, and a live subscription that had been
   * accumulating across that same span would count them a second time.
   */
  const watchSteps = useCallback(() => {
    stepSubscription.current?.remove();
    consumedSteps.current = 0;
    stepSubscription.current = Pedometer.watchStepCount((result) => addSteps(result.steps));
  }, [addSteps]);

  const stopSources = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    stepSubscription.current?.remove();
    stepSubscription.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (mockTicker.current) clearInterval(mockTicker.current);
    mockTicker.current = null;
  }, []);

  // Never leave a GPS subscription running after the screen goes away — it is
  // the fastest way to drain a battery.
  useEffect(() => stopSources, [stopSources]);

  // An unfinished run from a previous visit. It comes back paused: resuming is
  // the user's call, not something that starts recording behind their back.
  useEffect(() => {
    let cancelled = false;
    void runDraft.load().then((draft) => {
      if (cancelled || !draft) return;
      setState((prev) => (prev.status === 'idle' && prev.track.length === 0 ? fromDraft(draft) : prev));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    latest.current = state;
  }, [state]);

  // Autosave, throttled. Anything more frequent is an AsyncStorage write per
  // GPS fix, which is a write a second.
  useEffect(() => {
    if (state.status !== 'running') return;
    const now = Date.now();
    if (now - lastSavedAt.current < DRAFT_SAVE_INTERVAL_MS) return;
    lastSavedAt.current = now;
    void runDraft.save(toDraft(state));
  }, [state]);

  /**
   * Pulls in everything that happened while the app was not on screen: the
   * fixes the task buffered, and — on iOS, where the live subscription dies
   * with the app — the steps the OS counted in the meantime.
   *
   * The whole run is then re-credited from scratch with `creditStepSamples`,
   * the same function the server runs. Patching the incremental count instead
   * would drift across a gap, and the server's number is the one that pays.
   */
  const syncFromBackground = useCallback(async () => {
    if (useMockSensors) return;

    const fixes = await drainBackgroundFixes().catch(() => [] as GeoPoint[]);

    let backfilled: { from: number; to: number; steps: number } | null = null;
    if (Platform.OS === 'ios') {
      const window = backfillWindow(
        latest.current.stepSamples,
        latest.current.startedAt,
        Date.now(),
      );
      if (window) {
        const counted = await Pedometer.getStepCountAsync(
          new Date(window.from),
          new Date(window.to),
        ).catch(() => null);
        if (counted && counted.steps > 0) backfilled = { ...window, steps: counted.steps };
      }
    }

    if (fixes.length === 0 && !backfilled) return;

    setState((prev) => {
      if (prev.status !== 'running') return prev;
      const track = mergeFixes(prev.track, fixes);
      const stepSamples = backfilled
        ? appendBackfill(prev.stepSamples, backfilled)
        : prev.stepSamples;
      const stats = summarizeTrack(track);
      const credit = creditStepSamples(track, stepSamples);
      return {
        ...prev,
        track,
        stepSamples,
        distanceMetres: stats.distanceMetres,
        movingSeconds: stats.movingSeconds,
        rejectedPoints: stats.rejectedPoints,
        speedMps: averageSpeed(stats.distanceMetres, stats.movingSeconds),
        steps: credit.steps,
        droppedSteps: credit.dropped,
        rawSteps: stepSamples[stepSamples.length - 1]?.steps ?? prev.rawSteps,
        metresAtLastStep: stats.distanceMetres,
      };
    });

    // The subscription that was counting across the backfilled span has to
    // start again from zero, or those steps arrive twice.
    if (backfilled) watchSteps();
  }, [watchSteps]);

  // Coming back to the app is the moment to collect what it missed.
  useEffect(() => {
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active' && latest.current.status === 'running') void syncFromBackground();
    });
    return () => listener.remove();
  }, [syncFromBackground]);

  const startSources = useCallback(async () => {
    // A new pedometer subscription counts from zero again.
    consumedSteps.current = 0;

    if (useMockSensors) {
      // The synthesised run carries its own clock — see MOCK_TICK_MS.
      let index = 0;
      // Resuming continues the synthesised clock rather than jumping back to
      // now, which would put the new fixes before the old ones.
      const clock = latest.current.track.at(-1)?.timestamp ?? Date.now();
      setState((prev) => ({ ...prev, pedometer: 'available' }));
      mockTicker.current = setInterval(() => {
        index += 1;
        const timestamp = clock + index * MOCK_TICK_SECONDS * 1000;
        addPoint({
          // ~2.8 m/s — a believable 6 min/km jog.
          latitude: 13.7563 + index * 0.000125,
          longitude: 100.5018 + index * 0.00002,
          timestamp,
          accuracy: 6,
        });
        addSteps(index * MOCK_STEPS_PER_TICK, timestamp);
        setState((prev) =>
          prev.status === 'running'
            ? { ...prev, elapsedSeconds: index * MOCK_TICK_SECONDS }
            : prev,
        );
      }, MOCK_TICK_MS);
      return;
    }

    timer.current = setInterval(() => {
      setState((prev) =>
        prev.status === 'running' ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : prev,
      );
    }, 1000);

    subscription.current = await Location.watchPositionAsync(LOCATION_OPTIONS, (loc) => {
      addPoint({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        timestamp: loc.timestamp,
        accuracy: loc.coords.accuracy ?? undefined,
        speed: loc.coords.speed ?? undefined,
        altitude: loc.coords.altitude ?? undefined,
      });
    });

    // No pedometer is not a reason to refuse the run: it costs the star, not
    // the points, and the screen says so rather than failing silently.
    const available = await Pedometer.isAvailableAsync().catch(() => false);
    if (!available) {
      setState((prev) => ({ ...prev, pedometer: 'unavailable' }));
      return;
    }

    const { granted } = await Pedometer.requestPermissionsAsync();
    if (!granted) {
      setState((prev) => ({ ...prev, pedometer: 'unavailable' }));
      return;
    }

    setState((prev) => ({ ...prev, pedometer: 'available' }));
    watchSteps();
  }, [addPoint, addSteps, watchSteps]);

  const start = useCallback(async () => {
    if (!useMockSensors) {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setState((prev) => ({
          ...prev,
          permission: 'denied',
          error: 'Location permission is required to measure a run.',
        }));
        return false;
      }
    }

    await runDraft.clear();
    lastSavedAt.current = 0;
    setState({
      ...INITIAL,
      id: newRunId(),
      startedAt: Date.now(),
      status: 'running',
      permission: 'granted',
    });
    await startSources();

    if (!useMockSensors) {
      const background = await startBackgroundLocation().catch(
        () => 'denied' as BackgroundStatus,
      );
      setState((prev) => (prev.status === 'running' ? { ...prev, background } : prev));
    }
    return true;
  }, [startSources]);

  const pause = useCallback(() => {
    if (latest.current.status !== 'running') return;
    stopSources();
    void stopBackgroundLocation();
    setState((prev) => (prev.status === 'running' ? { ...prev, status: 'paused' } : prev));

    // Saved immediately rather than on the throttle: a pause is exactly when
    // someone puts the phone away. The draft holds no status, so the state as
    // it stands is the right thing to write.
    lastSavedAt.current = Date.now();
    void runDraft.save(toDraft(latest.current));
  }, [stopSources]);

  const resume = useCallback(async () => {
    setState((prev) =>
      prev.status === 'paused' ? { ...prev, status: 'running', error: undefined } : prev,
    );
    await startSources();

    if (!useMockSensors) {
      const background = await startBackgroundLocation().catch(
        () => 'denied' as BackgroundStatus,
      );
      setState((prev) => (prev.status === 'running' ? { ...prev, background } : prev));
      // A run paused from the tab bar rather than the button may have kept
      // recording; take whatever the task buffered before carrying on.
      await syncFromBackground();
    }
  }, [startSources, syncFromBackground]);

  /**
   * Ends the run and returns the state it ended in.
   *
   * The snapshot is returned rather than read off the hook because the last
   * thing finishing does is collect the background buffer, and a screen
   * reading `session.track` from its own render would miss exactly the fixes
   * that were just recovered.
   */
  const finish = useCallback(async (): Promise<RunSessionState> => {
    await syncFromBackground();
    stopSources();
    void stopBackgroundLocation();
    void runDraft.clear();

    return new Promise<RunSessionState>((resolve) => {
      setState((prev) => {
        const finished: RunSessionState = { ...prev, status: 'finished' };
        resolve(finished);
        return finished;
      });
    });
  }, [stopSources, syncFromBackground]);

  const reset = useCallback(() => {
    stopSources();
    void stopBackgroundLocation();
    void runDraft.clear();
    void clearBackgroundFixes();
    setState(INITIAL);
  }, [stopSources]);

  return { ...state, start, pause, resume, finish, reset };
}
