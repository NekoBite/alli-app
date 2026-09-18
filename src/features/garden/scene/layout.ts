import type { PlotView } from '../types';
import { visualFor, type PlantVisual } from './visual';

/**
 * Where each plant stands. Everything is derived from the plot id, so a tree
 * keeps its spot between renders, refreshes and app launches without storing
 * a position anywhere — the server never needs to know about the scene.
 */
export type PlantPlacement = {
  id: string;
  view: PlotView;
  visual: PlantVisual;
  /** Base of the plant, in canvas pixels. */
  x: number;
  y: number;
  /** Scale factor for the sprite: 1 = the sketch's full-size tree. */
  scale: number;
  /** Petal colour for the flowering stages; from the sketch's random RGB. */
  petal: string;
  /** Points on the winter star (5–8 in the sketch). */
  starPoints: number;
  /** Tap target, in canvas pixels. */
  hit: { x: number; y: number; width: number; height: number };
};

export type SceneLayout = {
  width: number;
  height: number;
  /** y of the horizon line where the ground starts. */
  horizon: number;
  sun: { x: number; y: number; r: number };
  plants: PlantPlacement[];
};

/** Height of a full-size tree in the sketch, from base to canopy top. */
const TREE_HEIGHT = 230;
const TREE_HALF_WIDTH = 100;
/** Fraction of the canvas the sky takes. */
const HORIZON = 0.72;
/** Mature trees should fill this much of the space above the horizon. */
const TREE_FILL = 0.8;
/**
 * When plants outnumber the room, they shrink so their canopies do not
 * swallow each other — down to this fraction of full size, after which they
 * are allowed to overlap like a real hedge would.
 */
const MIN_CROWD_SCALE = 0.55;
/** How much of a plant's canopy width its slot should clear before shrinking. */
const CROWD_CLEARANCE = 0.75;

export function layoutScene(views: PlotView[], width: number, height: number): SceneLayout {
  const horizon = Math.round(height * HORIZON);
  const fullScale = (horizon * TREE_FILL) / TREE_HEIGHT;
  const sun = { x: width * 0.12, y: 0, r: Math.max(24, height * 0.22) };

  // Newest plots come first from the store; plant them left to right in the
  // order they were bought so the garden fills in predictably.
  const ordered = [...views].sort((a, b) => a.plantedAt - b.plantedAt);
  const count = ordered.length;
  const margin = Math.min(width * 0.12, TREE_HALF_WIDTH * fullScale);
  const usable = Math.max(0, width - margin * 2);
  const slot = count > 0 ? usable / count : usable;
  const crowd = slot / (TREE_HALF_WIDTH * 2 * fullScale * CROWD_CLEARANCE);
  const scale = fullScale * Math.min(1, Math.max(MIN_CROWD_SCALE, crowd));

  const plants = ordered.map((view, index) => {
    const seed = hash(view.id);
    const jitterX = (rand(seed, 1) - 0.5) * slot * 0.5;
    const x = margin + slot * (index + 0.5) + jitterX;
    // Stagger depth a little so a row of trees does not look like a fence.
    const y = horizon + rand(seed, 2) * (height - horizon) * 0.45;
    const visual = visualFor(view);
    const petal = rgb(rand(seed, 3), rand(seed, 4), rand(seed, 5));
    const starPoints = 5 + Math.floor(rand(seed, 6) * 4);

    const hitWidth = TREE_HALF_WIDTH * 2 * scale * 0.7;
    const hitHeight = TREE_HEIGHT * scale;
    return {
      id: view.id,
      view,
      visual,
      x,
      y,
      scale,
      petal,
      starPoints,
      hit: { x: x - hitWidth / 2, y: y - hitHeight, width: hitWidth, height: hitHeight + 12 },
    };
  });

  return { width, height, horizon, sun, plants };
}

/** The plant under a tap, if any. Later (front-most) plants win. */
export function hitTest(layout: SceneLayout, x: number, y: number): PlantPlacement | null {
  const byDepth = [...layout.plants].sort((a, b) => b.y - a.y);
  for (const plant of byDepth) {
    const { hit } = plant;
    if (x >= hit.x && x <= hit.x + hit.width && y >= hit.y && y <= hit.y + hit.height) {
      return plant;
    }
  }
  return null;
}

/** Plants sorted back to front so nearer ones paint over farther ones. */
export function paintOrder(layout: SceneLayout): PlantPlacement[] {
  return [...layout.plants].sort((a, b) => a.y - b.y);
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

function rgb(r: number, g: number, b: number): string {
  // Bias towards saturated, light petals — the sketch picks any RGB, which
  // produced a lot of muddy browns.
  const channel = (v: number) => Math.round(120 + v * 135);
  return `rgb(${channel(r)}, ${channel(g)}, ${channel(b)})`;
}
