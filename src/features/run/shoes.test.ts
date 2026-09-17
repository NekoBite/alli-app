import { DEFAULT_SHOE_TIER, SHOES, SHOE_ORDER, shoeFor, shoeMultiplier } from './shoes';

describe('shoes', () => {
  it('issues the free tier by default', () => {
    expect(DEFAULT_SHOE_TIER).toBe('leather');
    expect(SHOES.leather.rewardMultiplier).toBe(1);
  });

  it('falls back to the free tier rather than throwing on an unknown one', () => {
    expect(shoeFor(undefined).tier).toBe(DEFAULT_SHOE_TIER);
    expect(shoeMultiplier(undefined)).toBe(1);
  });

  it('climbs in upgrade order', () => {
    const multipliers = SHOE_ORDER.map((tier) => SHOES[tier].rewardMultiplier);
    expect(multipliers).toEqual([1, 3, 5]);
    expect([...multipliers].sort((a, b) => a - b)).toEqual(multipliers);
  });

  it('keys every tier to itself, so a lookup cannot silently mismatch', () => {
    for (const tier of SHOE_ORDER) {
      expect(SHOES[tier].tier).toBe(tier);
    }
  });
});
