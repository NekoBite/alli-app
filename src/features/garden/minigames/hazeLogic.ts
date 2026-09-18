/**
 * Haze control: the rules, without the drawing. Embers drift in from the
 * neighbours' fires on the left; tap them out before they cross the field, or
 * the haze thickens. Meanwhile drag the residue piles into the bale on the
 * right instead of leaving them to burn. Bale them all before the clock runs
 * out and before the haze closes in.
 */

export const HAZE_PILES = 6;
/** Haze added by each ember that crosses the field untouched. */
export const HAZE_PER_ESCAPE = 0.2;
export const EMBER_SPAWN_MS = 1_400;
/** Pixels per second an ember drifts. */
export const EMBER_SPEED = 42;

export type Point = { x: number; y: number };
export type Pile = Point & { id: number };
export type Ember = { id: number; y: number; bornAt: number; startX: number };

export type HazeLayout = {
  width: number;
  height: number;
  horizon: number;
  /** Where piles must be dropped to count as baled. */
  bale: { x: number; y: number; width: number; height: number };
};

export function layoutHaze(width: number, height: number): HazeLayout {
  const horizon = Math.round(height * 0.42);
  return {
    width,
    height,
    horizon,
    bale: { x: width * 0.78, y: horizon + 10, width: width * 0.2, height: height - horizon - 20 },
  };
}

/** Piles scattered over the field, left of the bale, in a stable pattern. */
export function pilePositions(layout: HazeLayout, count = HAZE_PILES): Pile[] {
  const field = { left: layout.width * 0.1, right: layout.bale.x - 30 };
  const top = layout.horizon + 24;
  const bottom = layout.height - 28;
  return Array.from({ length: count }, (_, i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    return {
      id: i + 1,
      x: field.left + ((col + 0.5) / 3) * (field.right - field.left) + (row % 2 === 0 ? -12 : 12),
      y: top + ((row + 0.5) / Math.ceil(count / 3)) * (bottom - top),
    };
  });
}

export function emberX(ember: Ember, now: number): number {
  return ember.startX + (EMBER_SPEED * Math.max(0, now - ember.bornAt)) / 1000;
}

/** An ember that has drifted past the bale has landed somewhere it will burn. */
export function escaped(ember: Ember, layout: HazeLayout, now: number): boolean {
  return emberX(ember, now) >= layout.bale.x + layout.bale.width;
}

export function inBale(layout: HazeLayout, x: number, y: number): boolean {
  const { bale } = layout;
  return x >= bale.x && x <= bale.x + bale.width && y >= bale.y && y <= bale.y + bale.height;
}

export function hitEmber(embers: Ember[], now: number, x: number, y: number, r = 26): Ember | null {
  for (const ember of embers) {
    if (Math.hypot(emberX(ember, now) - x, ember.y - y) <= r) return ember;
  }
  return null;
}

export function hitPile(piles: Pile[], x: number, y: number, r = 30): Pile | null {
  for (const pile of piles) {
    if (Math.hypot(pile.x - x, pile.y - y) <= r) return pile;
  }
  return null;
}

/** A new ember on the left edge, at a stable height for its id. */
export function spawnEmber(id: number, layout: HazeLayout, now: number): Ember {
  const lanes = 5;
  const lane = (id * 7) % lanes;
  const top = layout.horizon - 20;
  const bottom = layout.height - 30;
  return { id, y: top + ((lane + 0.5) / lanes) * (bottom - top), bornAt: now, startX: -16 };
}
