import type { Seed } from './types';

/**
 * Seed catalogue. Prices and rewards are placeholders for a scaffold — they are
 * not a balanced economy. Before launch these must move server-side so they can
 * be tuned without an app release, and be checked against the ALLI emission
 * schedule (see docs/architecture.md §4).
 *
 * Standard seeds are bought with ALLI and play the low-carbon loop: more to do,
 * and the reward scales with how the farm is run. Premium seeds are bought with
 * USDT, pay more and play the simple loop. A tree lives thirty days either way,
 * so `starsPerDay × lifetimeDays` is the most a seed can ever pay before the
 * streak and carbon multipliers.
 */
export const SEEDS: Seed[] = [
  {
    id: 'seed-acacia',
    name: 'Acacia Sapling',
    species: 'Acacia mangium',
    tier: 'standard',
    currency: 'ALLI',
    price: 50,
    careProfile: 'lowCarbon',
    starsPerDay: 0.02,
    lifetimeDays: 30,
    runBonus: 0.02,
    blurb: 'Fast-growing starter tree. Cheap, forgiving, and a good place to learn the farm.',
  },
  {
    id: 'seed-neem',
    name: 'Neem',
    species: 'Azadirachta indica',
    tier: 'standard',
    currency: 'ALLI',
    price: 120,
    careProfile: 'lowCarbon',
    starsPerDay: 0.05,
    lifetimeDays: 30,
    runBonus: 0.03,
    blurb: 'Pays more than twice an Acacia for the same care.',
  },
  {
    id: 'seed-teak',
    name: 'Teak',
    species: 'Tectona grandis',
    tier: 'standard',
    currency: 'ALLI',
    price: 300,
    careProfile: 'lowCarbon',
    starsPerDay: 0.12,
    lifetimeDays: 30,
    runBonus: 0.05,
    blurb: 'The long game. Best ALLI-priced reward and a solid run bonus.',
  },
  {
    id: 'seed-mangrove-premium',
    name: 'Mangrove (Premium)',
    species: 'Rhizophora apiculata',
    tier: 'premium',
    currency: 'USDT',
    price: 5,
    careProfile: 'simple',
    starsPerDay: 0.1,
    lifetimeDays: 30,
    runBonus: 0.1,
    blurb: 'Coastal carbon sink. Simple care, paid in stars every day it thrives, +10% on every run.',
  },
  {
    id: 'seed-ironwood-premium',
    name: 'Ironwood (Premium)',
    species: 'Eusideroxylon zwageri',
    tier: 'premium',
    currency: 'USDT',
    price: 20,
    careProfile: 'simple',
    starsPerDay: 0.5,
    lifetimeDays: 30,
    runBonus: 0.2,
    blurb: 'The flagship tree. Highest daily reward in the garden and a +20% run multiplier.',
  },
];

export function findSeed(seedId: string): Seed | undefined {
  return SEEDS.find((seed) => seed.id === seedId);
}

export const STANDARD_SEEDS = SEEDS.filter((s) => s.tier === 'standard');
export const PREMIUM_SEEDS = SEEDS.filter((s) => s.tier === 'premium');
