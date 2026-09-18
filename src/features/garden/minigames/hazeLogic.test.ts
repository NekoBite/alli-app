import {
  EMBER_SPEED,
  emberX,
  escaped,
  HAZE_PILES,
  hitEmber,
  hitPile,
  inBale,
  layoutHaze,
  pilePositions,
  spawnEmber,
} from './hazeLogic';

describe('haze control', () => {
  const layout = layoutHaze(360, 300);

  it('puts every pile on the field, left of the bale', () => {
    const piles = pilePositions(layout);
    expect(piles).toHaveLength(HAZE_PILES);
    for (const pile of piles) {
      expect(pile.y).toBeGreaterThan(layout.horizon);
      expect(pile.y).toBeLessThan(layout.height);
      expect(pile.x).toBeGreaterThan(0);
      expect(pile.x).toBeLessThan(layout.bale.x);
      expect(inBale(layout, pile.x, pile.y)).toBe(false);
    }
    expect(inBale(layout, layout.bale.x + 5, layout.bale.y + 5)).toBe(true);
  });

  it('drifts embers rightwards at a steady speed and marks the ones that cross', () => {
    const ember = spawnEmber(1, layout, 1_000);
    expect(emberX(ember, 1_000)).toBe(ember.startX);
    expect(emberX(ember, 2_000)).toBeCloseTo(ember.startX + EMBER_SPEED);
    expect(escaped(ember, layout, 1_000)).toBe(false);
    const crossing = ((layout.width - ember.startX) / EMBER_SPEED) * 1000;
    expect(escaped(ember, layout, 1_000 + crossing + 100)).toBe(true);
  });

  it('spreads embers across lanes and keeps them on screen', () => {
    const lanes = new Set(Array.from({ length: 10 }, (_, i) => spawnEmber(i, layout, 0).y));
    expect(lanes.size).toBeGreaterThan(1);
    for (const y of lanes) {
      expect(y).toBeGreaterThan(0);
      expect(y).toBeLessThan(layout.height);
    }
  });

  it('hit-tests embers where they are now, and piles where they sit', () => {
    const ember = spawnEmber(3, layout, 0);
    const now = 3_000;
    expect(hitEmber([ember], now, emberX(ember, now) + 4, ember.y - 4)?.id).toBe(3);
    expect(hitEmber([ember], now, ember.startX, ember.y)).toBeNull();
    const piles = pilePositions(layout);
    expect(hitPile(piles, piles[2]!.x + 5, piles[2]!.y)?.id).toBe(3);
    expect(hitPile(piles, 1, 1)).toBeNull();
  });
});
