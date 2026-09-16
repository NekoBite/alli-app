import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

import { isMock } from '@/config/env';
import { averageSpeed, summarizeTrack } from './geo';
import type { GeoPoint, JogStatus } from './types';

/** How often the OS should hand us a fix while a run is active. */
const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 5,
};

export type JogSessionState = {
  status: JogStatus;
  track: GeoPoint[];
  distanceMetres: number;
  /** Wall-clock seconds since start, excluding paused time. */
  elapsedSeconds: number;
  movingSeconds: number;
  /** Current pace source: m/s over moving time. */
  speedMps: number;
  rejectedPoints: number;
  permission: 'unknown' | 'granted' | 'denied';
  error?: string;
};

const INITIAL: JogSessionState = {
  status: 'idle',
  track: [],
  distanceMetres: 0,
  elapsedSeconds: 0,
  movingSeconds: 0,
  speedMps: 0,
  rejectedPoints: 0,
  permission: 'unknown',
};

/**
 * Owns one live run: permissions, the GPS subscription, and the derived stats.
 *
 * In mock mode it synthesises a plausible track so the run screen can be
 * developed on a simulator with no GPS. Flip EXPO_PUBLIC_DATA_SOURCE to `live`
 * for the real subscription.
 *
 * TODO (before release): a foreground-service task via expo-task-manager, so a
 * run keeps recording when the screen locks. Without it iOS suspends the app and
 * the track ends mid-run.
 */
export function useJogSession() {
  const [state, setState] = useState<JogSessionState>(INITIAL);
  const subscription = useRef<Location.LocationSubscription | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const mockTicker = useRef<ReturnType<typeof setInterval> | null>(null);

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

  const stopSources = useCallback(() => {
    subscription.current?.remove();
    subscription.current = null;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    if (mockTicker.current) clearInterval(mockTicker.current);
    mockTicker.current = null;
  }, []);

  // Never leave a GPS subscription running after the screen goes away — it is
  // the fastest way to drain a battery.
  useEffect(() => stopSources, [stopSources]);

  const startSources = useCallback(async () => {
    timer.current = setInterval(() => {
      setState((prev) =>
        prev.status === 'running' ? { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 } : prev,
      );
    }, 1000);

    if (isMock) {
      let index = 0;
      mockTicker.current = setInterval(() => {
        index += 1;
        addPoint({
          // ~2.8 m/s — a believable 6 min/km jog.
          latitude: 13.7563 + index * 0.000125,
          longitude: 100.5018 + index * 0.00002,
          timestamp: Date.now(),
          accuracy: 6,
        });
      }, 5000);
      return;
    }

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
  }, [addPoint]);

  const start = useCallback(async () => {
    if (!isMock) {
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

    setState({ ...INITIAL, status: 'running', permission: 'granted' });
    await startSources();
    return true;
  }, [startSources]);

  const pause = useCallback(() => {
    stopSources();
    setState((prev) => (prev.status === 'running' ? { ...prev, status: 'paused' } : prev));
  }, [stopSources]);

  const resume = useCallback(async () => {
    setState((prev) => (prev.status === 'paused' ? { ...prev, status: 'running' } : prev));
    await startSources();
  }, [startSources]);

  const finish = useCallback(() => {
    stopSources();
    setState((prev) => ({ ...prev, status: 'finished' }));
  }, [stopSources]);

  const reset = useCallback(() => {
    stopSources();
    setState(INITIAL);
  }, [stopSources]);

  return { ...state, start, pause, resume, finish, reset };
}
