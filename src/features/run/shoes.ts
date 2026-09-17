/**
 * NFT footwear.
 *
 * Every account is issued a Leather shoe free at registration, so there is no
 * state where a runner cannot earn. Silver and Gold multiply the daily quest
 * reward — they are the whole reason to upgrade, and the whole emission risk:
 * a Gold holder mints five times what a Leather holder does for the same
 * 6,000 steps. Model the float against the tier mix, not the headcount.
 *
 * Pure and shared with the server, which is authoritative about which tier an
 * account actually holds. A multiplier the phone can set is a multiplier the
 * phone can set to 1000.
 */

export type ShoeTier = 'leather' | 'silver' | 'gold';

export type Shoe = {
  tier: ShoeTier;
  name: string;
  /** Multiplies the stars the daily quest pays. */
  rewardMultiplier: number;
  blurb: string;
};

/** The tier issued free on registration. */
export const DEFAULT_SHOE_TIER: ShoeTier = 'leather';

export const SHOES: Record<ShoeTier, Shoe> = {
  leather: {
    tier: 'leather',
    name: 'Leather',
    rewardMultiplier: 1,
    blurb: 'Issued free when you sign up. Earns the base daily reward.',
  },
  silver: {
    tier: 'silver',
    name: 'Silver',
    rewardMultiplier: 3,
    blurb: 'Triples what the daily quest pays.',
  },
  gold: {
    tier: 'gold',
    name: 'Gold',
    rewardMultiplier: 5,
    blurb: 'Five times the daily quest reward — the top tier.',
  },
};

/** Tiers in upgrade order, for pickers and comparisons. */
export const SHOE_ORDER: ShoeTier[] = ['leather', 'silver', 'gold'];

export function shoeFor(tier: ShoeTier | undefined): Shoe {
  return SHOES[tier ?? DEFAULT_SHOE_TIER] ?? SHOES[DEFAULT_SHOE_TIER];
}

/** What this tier multiplies the quest reward by. 1 when the tier is unknown. */
export function shoeMultiplier(tier: ShoeTier | undefined): number {
  return shoeFor(tier).rewardMultiplier;
}
