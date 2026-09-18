import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { kv, KEYS } from '@/services/storage/kv';
import type { GeoPoint } from './types';

/**
 * Recording a run while the app is not on screen.
 *
 * A phone goes in a pocket and the screen locks, and a foreground subscription
 * stops there: iOS suspends the app outright, Android may kill it under memory
 * pressure. Without this, a run ends the moment the user stops looking at it —
 * and because steps are only credited where GPS movement backs them, losing the
 * track in the background loses the steps too, even on Android where the
 * pedometer keeps counting.
 *
 * So the location updates move to a task the OS owns. It writes fixes to
 * storage, because a task can be woken into a process with no React tree to
 * hand them to. The session drains that buffer whenever it comes back to the
 * foreground (see `useRunSession`).
 *
 * On Android the task runs inside a foreground service — the persistent
 * notification is the platform's price for background location, and honest
 * about what the app is doing.
 */

export const RUN_LOCATION_TASK = 'alli.run.location';

/** Web has no task manager and no background anything; the mock path covers it. */
const SUPPORTED = Platform.OS === 'ios' || Platform.OS === 'android';

export const BACKGROUND_LOCATION_OPTIONS: Location.LocationTaskOptions = {
  accuracy: Location.Accuracy.BestForNavigation,
  timeInterval: 1000,
  distanceInterval: 5,
  // A run is exactly when not to power down the GPS to save battery.
  pausesUpdatesAutomatically: false,
  activityType: Location.LocationActivityType.Fitness,
  showsBackgroundLocationIndicator: true,
  foregroundService: {
    notificationTitle: 'ALLI RUN is recording',
    notificationBody: 'Your route and steps are being tracked.',
    notificationColor: '#00FF88',
  },
};

function toGeoPoint(location: Location.LocationObject): GeoPoint {
  return {
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
    timestamp: location.timestamp,
    accuracy: location.coords.accuracy ?? undefined,
    speed: location.coords.speed ?? undefined,
    altitude: location.coords.altitude ?? undefined,
  };
}

async function buffer(points: GeoPoint[]): Promise<void> {
  if (points.length === 0) return;
  const existing = (await kv.get<GeoPoint[]>(KEYS.runBackgroundFixes)) ?? [];
  await kv.set(KEYS.runBackgroundFixes, [...existing, ...points]);
}

// Defined at import time, not inside a component: the OS can wake this task
// into a fresh process, and it has to already exist when that happens. The
// module is imported from app/_layout.tsx for that reason.
if (SUPPORTED) {
  TaskManager.defineTask(RUN_LOCATION_TASK, async ({ data, error }) => {
    if (error) return;
    const locations = (data as { locations?: Location.LocationObject[] } | undefined)?.locations;
    if (!locations?.length) return;
    await buffer(locations.map(toGeoPoint)).catch(() => undefined);
  });
}

export type BackgroundStatus = 'unsupported' | 'started' | 'denied';

/**
 * Starts background recording, asking for the permission it needs.
 *
 * Returns `denied` rather than throwing: a run without background permission
 * still records perfectly well while the screen is on, and refusing to start
 * one would be a worse answer than telling the runner to keep the screen awake.
 */
export async function startBackgroundLocation(): Promise<BackgroundStatus> {
  if (!SUPPORTED) return 'unsupported';

  const { granted } = await Location.requestBackgroundPermissionsAsync();
  if (!granted) return 'denied';

  const already = await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK);
  if (!already) {
    await Location.startLocationUpdatesAsync(RUN_LOCATION_TASK, BACKGROUND_LOCATION_OPTIONS);
  }
  return 'started';
}

export async function stopBackgroundLocation(): Promise<void> {
  if (!SUPPORTED) return;
  const started = await Location.hasStartedLocationUpdatesAsync(RUN_LOCATION_TASK).catch(
    () => false,
  );
  if (started) await Location.stopLocationUpdatesAsync(RUN_LOCATION_TASK).catch(() => undefined);
}

/**
 * Takes everything the task has buffered and clears it.
 *
 * Read-then-clear rather than clear-then-read: a task firing in between loses
 * at worst one batch of fixes, where the other order would drop them silently
 * and leave the steps they backed uncredited.
 */
export async function drainBackgroundFixes(): Promise<GeoPoint[]> {
  if (!SUPPORTED) return [];
  const points = (await kv.get<GeoPoint[]>(KEYS.runBackgroundFixes)) ?? [];
  if (points.length > 0) await kv.remove(KEYS.runBackgroundFixes);
  return points;
}

/** Throws the buffer away — for a run that was discarded rather than finished. */
export async function clearBackgroundFixes(): Promise<void> {
  await kv.remove(KEYS.runBackgroundFixes);
}
