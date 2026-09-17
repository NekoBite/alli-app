import type { Seed } from './types';

/**
 * Seed catalogue. Prices and yields are placeholders for a scaffold — they are
 * not a balanced economy. Before launch these must move server-side so they can
 * be tuned without an app release, and be checked against the ALLI emission
 * schedule (see docs/alli-app-architecture.md).
 *
 * Sanity check on the numbers below: a standard seed pays back its ALLI cost
 * over its harvests and then some; a premium seed is bought with USDT, so its
 * ALLI yield is real emission and has to be funded by the treasury.
 */
export const SEEDS: Seed[] = [
  {
    id: 'seed-acacia',
    name: 'Acacia Sapling',
    species: 'Acacia mangium',
    tier: 'standard',
    currency: 'ALLI',
    price: 50,
    growthHours: 24,
    yieldAlli: 12,
    harvestsTotal: 6,
    runBonus: 0.02,
    blurb: 'Fast-growing starter tree. Cheap, forgiving, and pays back in under a week.',
  },
  {
    id: 'seed-neem',
    name: 'Neem',
    species: 'Azadirachta indica',
    tier: 'standard',
    currency: 'ALLI',
    price: 120,
    growthHours: 48,
    yieldAlli: 34,
    harvestsTotal: 8,
    runBonus: 0.03,
    blurb: 'Slower, but each harvest is worth nearly three Acacias.',
  },
  {
    id: 'seed-teak',
    name: 'Teak',
    species: 'Tectona grandis',
    tier: 'standard',
    currency: 'ALLI',
    price: 300,
    growthHours: 72,
    yieldAlli: 95,
    harvestsTotal: 10,
    runBonus: 0.05,
    blurb: 'The long game. Highest ALLI-priced yield and a solid run bonus.',
  },
  {
    id: 'seed-mangrove-premium',
    name: 'Mangrove (Premium)',
    species: 'Rhizophora apiculata',
    tier: 'premium',
    currency: 'USDT',
    price: 5,
    growthHours: 36,
    yieldAlli: 220,
    harvestsTotal: 12,
    runBonus: 0.1,
    blurb: 'Coastal carbon sink. Buy with USDT, harvest in ALLI, +10% on every run.',
  },
  {
    id: 'seed-ironwood-premium',
    name: 'Ironwood (Premium)',
    species: 'Eusideroxylon zwageri',
    tier: 'premium',
    currency: 'USDT',
    price: 20,
    growthHours: 60,
    yieldAlli: 1_050,
    harvestsTotal: 15,
    runBonus: 0.2,
    blurb: 'The flagship tree. Highest yield in the garden and a +20% run multiplier.',
  },
];

export function findSeed(seedId: string): Seed | undefined {
  return SEEDS.find((seed) => seed.id === seedId);
}

export const STANDARD_SEEDS = SEEDS.filter((s) => s.tier === 'standard');
export const PREMIUM_SEEDS = SEEDS.filter((s) => s.tier === 'premium');
