import type { GeoPoint } from './types';

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance in metres. */
export function haversine(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLon / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fixes worse than this are dropped — urban canyons produce huge jumps. */
export const MAX_ACCURACY_METRES = 30;

/** A single hop longer than this between consecutive fixes is GPS drift, not running. */
export const MAX_HOP_METRES = 120;

/** Below this the runner is standing still; the time counts as a pause. */
export const MIN_MOVING_SPEED_MPS = 0.5;

export type TrackStats = {
  distanceMetres: number;
  movingSeconds: number;
  /** Fixes dropped for poor accuracy or an implausible hop. */
  rejectedPoints: number;
};

/**
 * Reduces a raw track to the numbers the reward math runs on. Filtering happens
 * here — once, in one place — so the live screen and the server-side re-check
 * can agree on what a run was worth.
 */
export function summarizeTrack(track: GeoPoint[]): TrackStats {
  let distanceMetres = 0;
  let movingSeconds = 0;
  let rejectedPoints = 0;
  let previous: GeoPoint | undefined;

  for (const point of track) {
    if (point.accuracy !== undefined && point.accuracy > MAX_ACCURACY_METRES) {
      rejectedPoints += 1;
      continue;
    }

    if (!previous) {
      previous = point;
      continue;
    }

    const metres = haversine(previous, point);
    const seconds = (point.timestamp - previous.timestamp) / 1000;

    if (seconds <= 0 || metres > MAX_HOP_METRES) {
      rejectedPoints += 1;
      continue;
    }

    if (metres / seconds >= MIN_MOVING_SPEED_MPS) {
      distanceMetres += metres;
      movingSeconds += seconds;
    }

    previous = point;
  }

  return { distanceMetres, movingSeconds, rejectedPoints };
}

/** Average speed in m/s over moving time. */
export function averageSpeed(distanceMetres: number, movingSeconds: number): number {
  return movingSeconds > 0 ? distanceMetres / movingSeconds : 0;
}
