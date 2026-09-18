import type { GrowthStage } from '../types';

/**
 * Geometry for the single-tree stage: where the plant stands, where the sun
 * and hills go, and where sparkles hang so they can be tapped. Pure, so it is
 * unit-tested without a Skia runtime.
 */

export type StageLayout = {
  width: number;
  height: number;
  /** y of the horizon line where the ground starts. */
  horizon: number;
  sun: { x: number; y: number; r: number };
  hills: { cx: number; cy: number; r: number }[];
  /** Base of the plant, in canvas pixels, and the sprite scale (1 = the sketch's full tree). */
  plant: { x: number; y: number; scale: number };
};

export type SparkleSpot = { index: number; x: number; y: number; r: number };

/** Height of a full-size tree in the sketch, from base to canopy top. */
const TREE_HEIGHT = 230;
const HORIZON = 0.7;
const TREE_FILL = 0.86;

export function layoutStage(width: number, height: number): StageLayout {
  const horizon = Math.round(height * HORIZON);
  const scale = (horizon * TREE_FILL) / TREE_HEIGHT;
  return {
    width,
    height,
    horizon,
    sun: { x: width * 0.14, y: height * 0.06, r: Math.max(24, height * 0.16) },
    hills: [
      { cx: width * 0.2, cy: horizon + height * 0.42, r: height * 0.5 },
      { cx: width * 0.85, cy: horizon + height * 0.5, r: height * 0.62 },
    ],
    plant: { x: width / 2, y: horizon + Math.round((height - horizon) * 0.35), scale },
  };
}

/** Where sparkles hang on a full tree, in sketch units at scale 1 (base at the origin). */
const CANOPY_SPOTS: readonly (readonly [number, number])[] = [
  [-40, -150],
  [22, -125],
  [48, -185],
  [-12, -205],
  [-62, -195],
  [30, -235],
  [-30, -240],
  [0, -170],
];

/** Younger plants are small, so their sparkles float in the air just above them. */
const HALO_SPOTS: readonly (readonly [number, number])[] = [
  [-28, -60],
  [26, -70],
  [0, -88],
  [-42, -84],
  [42, -92],
  [-14, -108],
  [16, -112],
  [0, -128],
];

export function sparkleSpots(layout: StageLayout, form: GrowthStage, count: number): SparkleSpot[] {
  const spots = form === 'tree' ? CANOPY_SPOTS : HALO_SPOTS;
  const { x, y, scale } = layout.plant;
  const r = Math.max(14, 16 * scale * 1.6);
  return spots.slice(0, Math.max(0, Math.min(count, spots.length))).map(([sx, sy], index) => ({
    index,
    x: x + sx * scale,
    y: y + sy * scale,
    r,
  }));
}

/** The sparkle under a tap, if any. */
export function hitSparkle(spots: SparkleSpot[], x: number, y: number): SparkleSpot | null {
  for (const spot of spots) {
    const dx = x - spot.x;
    const dy = y - spot.y;
    if (dx * dx + dy * dy <= spot.r * spot.r) return spot;
  }
  return null;
}

/** Whether a tap landed on the plant itself, generously. */
export function hitPlant(layout: StageLayout, form: GrowthStage, x: number, y: number): boolean {
  const { plant } = layout;
  const halfWidth = (form === 'tree' ? 110 : 50) * plant.scale;
  const top = plant.y - (form === 'tree' ? TREE_HEIGHT : 90) * plant.scale;
  return x >= plant.x - halfWidth && x <= plant.x + halfWidth && y >= top - 10 && y <= plant.y + 14;
}

// --- deterministic pseudo-randomness ------------------------------------

/** FNV-1a, 32-bit. Small, stable across platforms, good enough for a garden. */
export function hash(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** A stable value in [0, 1) for (seed, stream). */
export function rand(seed: number, stream: number): number {
  let x = (seed ^ Math.imul(stream + 1, 0x9e3779b1)) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  x = (x ^ (x >>> 16)) >>> 0;
  return x / 0x100000000;
}

/** Petal colour for the flowering stage, from the plot id. */
export function petalFor(plotId: string): string {
  const seed = hash(plotId);
  const channel = (v: number) => Math.round(120 + v * 135);
  return `rgb(${channel(rand(seed, 3))}, ${channel(rand(seed, 4))}, ${channel(rand(seed, 5))})`;
}

/** Points on the winter star (5–8 in the sketch), from the plot id. */
export function starPointsFor(plotId: string): number {
  return 5 + Math.floor(rand(hash(plotId), 6) * 4);
}
