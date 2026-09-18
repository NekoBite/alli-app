/**
 * Mulch the roots: the rules, without the drawing. The sun climbs as the clock
 * runs, the bare soil dries, and straw dragged from the pile onto the ring
 * covers it. Cover enough before the sun is up.
 */

export const MULCH_GOAL = 8;

export type Point = { x: number; y: number };
export type MulchPiece = Point & { rotation: number };

export type MulchLayout = {
  width: number;
  height: number;
  horizon: number;
  ring: { cx: number; cy: number; r: number };
  pile: { cx: number; cy: number; r: number };
};

export function layoutMulch(width: number, height: number): MulchLayout {
  const horizon = Math.round(height * 0.5);
  return {
    width,
    height,
    horizon,
    ring: { cx: width * 0.55, cy: height * 0.72, r: Math.min(width, height) * 0.24 },
    pile: { cx: width * 0.14, cy: height * 0.86, r: Math.min(width, height) * 0.1 },
  };
}

/** How far through the round we are, 0 at the start and 1 at the deadline. */
export function progressAt(now: number, deadline: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  return Math.min(1, Math.max(0, 1 - (deadline - now) / durationMs));
}

/** The sun rises from behind the horizon to the top of the sky as the round runs. */
export function sunPosition(progress: number, layout: MulchLayout): Point {
  return {
    x: layout.width * 0.82,
    y: layout.horizon + 10 - progress * (layout.horizon + 10 - layout.height * 0.1),
  };
}

export function insidePile(layout: MulchLayout, x: number, y: number): boolean {
  return distance({ x, y }, { x: layout.pile.cx, y: layout.pile.cy }) <= layout.pile.r * 1.4;
}

export function insideRing(layout: MulchLayout, x: number, y: number): boolean {
  return distance({ x, y }, { x: layout.ring.cx, y: layout.ring.cy }) <= layout.ring.r;
}

/** Straw dropped inside the ring settles where it landed, at a stable angle. */
export function placePiece(pieces: MulchPiece[], x: number, y: number): MulchPiece[] {
  const rotation = ((pieces.length * 137.5) % 360) * (Math.PI / 180);
  return [...pieces, { x, y, rotation }];
}

/** 0 = fresh dark soil, 1 = baked pale soil. Mulch slows it in proportion to cover. */
export function dryness(progress: number, covered: number): number {
  const cover = Math.min(1, covered / MULCH_GOAL);
  return Math.min(1, Math.max(0, progress * (1 - 0.8 * cover)));
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
