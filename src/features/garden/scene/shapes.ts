/**
 * SVG path strings for the polygonal shapes in the sketch. Kept as plain
 * strings so they can be unit-tested without a Skia runtime and handed to
 * `<Path path="…">` as-is.
 */

type Point = readonly [number, number];

function pathFrom(points: readonly Point[]): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  const move = `M${fmt(first![0])} ${fmt(first![1])}`;
  const lines = rest.map(([x, y]) => `L${fmt(x)} ${fmt(y)}`).join(' ');
  return `${move}${lines ? ` ${lines}` : ''} Z`;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

/** Regular polygon, as in the sketch's `polygon()`. */
export function polygonPath(cx: number, cy: number, radius: number, sides: number): string {
  const n = Math.max(3, Math.floor(sides));
  const points: Point[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (Math.PI * 2 * i) / n;
    points.push([cx + Math.cos(a) * radius, cy + Math.sin(a) * radius]);
  }
  return pathFrom(points);
}

/** Star with `points` tips alternating between the two radii, tip pointing up. */
export function starPath(
  cx: number,
  cy: number,
  inner: number,
  outer: number,
  points: number,
): string {
  const n = Math.max(3, Math.floor(points));
  const step = Math.PI / n;
  const out: Point[] = [];
  for (let i = 0; i < n * 2; i += 1) {
    const a = -Math.PI / 2 + step * i;
    const r = i % 2 === 0 ? outer : inner;
    out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
  }
  return pathFrom(out);
}

/** The tree trunk from `drawTree()`: wide at the roots, straight above. */
export function trunkPath(x: number, y: number, g: number): string {
  return pathFrom([
    [x + 20 * g, y],
    [x + 14 * g, y - 100 * g],
    [x + 14 * g, y - 200 * g],
    [x - 14 * g, y - 200 * g],
    [x - 14 * g, y - 100 * g],
    [x - 20 * g, y],
  ]);
}

/** One blade of grass from `drawGrass()`; `lean` is 1 to the right, -1 to the left. */
export function grassPath(x: number, y: number, g: number, lean: 1 | -1): string {
  const s = lean;
  return pathFrom([
    [x + 2.5 * g * s, y],
    [x + 2.5 * g * s, y - 15 * g],
    [x + 5 * g * s, y - 25 * g],
    [x - 2.5 * g * s, y - 15 * g],
    [x - 2.5 * g * s, y],
  ]);
}

/** An isoceles triangle, base centred on (x, baseY). Used for the winter fir. */
export function trianglePath(x: number, baseY: number, halfWidth: number, height: number): string {
  return pathFrom([
    [x + halfWidth, baseY],
    [x - halfWidth, baseY],
    [x, baseY - height],
  ]);
}
