import {
  dryness,
  insidePile,
  insideRing,
  layoutMulch,
  MULCH_GOAL,
  placePiece,
  progressAt,
  sunPosition,
} from './mulchLogic';

describe('mulch the roots', () => {
  const layout = layoutMulch(360, 300);

  it('keeps the ring and the pile on the ground and apart', () => {
    expect(layout.ring.cy).toBeGreaterThan(layout.horizon);
    expect(layout.pile.cy).toBeGreaterThan(layout.horizon);
    expect(insideRing(layout, layout.pile.cx, layout.pile.cy)).toBe(false);
    expect(insidePile(layout, layout.ring.cx, layout.ring.cy)).toBe(false);
  });

  it('measures progress from the deadline', () => {
    expect(progressAt(0, 25_000, 25_000)).toBe(0);
    expect(progressAt(12_500, 25_000, 25_000)).toBeCloseTo(0.5);
    expect(progressAt(30_000, 25_000, 25_000)).toBe(1);
  });

  it('raises the sun as the round runs', () => {
    const dawn = sunPosition(0, layout);
    const noon = sunPosition(1, layout);
    expect(dawn.y).toBeGreaterThan(layout.horizon);
    expect(noon.y).toBeLessThan(dawn.y);
    expect(noon.y).toBeGreaterThan(0);
  });

  it('places straw where it was dropped with a stable angle', () => {
    const one = placePiece([], 100, 200);
    const two = placePiece(one, 110, 210);
    expect(two).toHaveLength(2);
    expect(two[0]!.rotation).toBe(0);
    expect(two[1]!.rotation).not.toBe(0);
    expect(placePiece(one, 110, 210)).toEqual(two);
  });

  it('dries slower the more is covered', () => {
    expect(dryness(0.5, 0)).toBeCloseTo(0.5);
    expect(dryness(0.5, MULCH_GOAL)).toBeCloseTo(0.1);
    expect(dryness(2, 0)).toBe(1);
  });
});
