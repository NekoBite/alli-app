import { colors } from '@/theme';
import type { Product } from './types';

/**
 * Placeholder catalogue. Real listings come from the backend — a physical
 * marketplace needs stock levels, per-region shipping and tax, none of which
 * belong in the bundle.
 */
export const PRODUCTS: Product[] = [
  {
    id: 'prod-runner-01',
    name: 'Trail Runner Cap',
    category: 'apparel',
    blurb: 'Lightweight, packable, sweat-wicking band. Made from recycled fibre.',
    priceUsd: 28,
    priceAlli: 2_200,
    accent: colors.green,
    inStock: true,
    shipsTo: [],
  },
  {
    id: 'prod-bottle-01',
    name: 'Insulated Bottle 600ml',
    category: 'gear',
    blurb: 'Double-walled steel. Keeps cold for 24 hours.',
    priceUsd: 34,
    priceAlli: 2_700,
    accent: colors.cyan,
    inStock: true,
    shipsTo: [],
  },
  {
    id: 'prod-tee-01',
    name: 'Alli Organic Tee',
    category: 'apparel',
    blurb: 'Organic cotton, screen-printed with the Alli mark.',
    priceUsd: 32,
    priceAlli: 2_500,
    accent: colors.teal,
    inStock: true,
    shipsTo: [],
  },
  {
    id: 'prod-band-01',
    name: 'Recovery Band Set',
    category: 'wellness',
    blurb: 'Three resistance levels for post-run mobility work.',
    priceUsd: 22,
    priceAlli: 1_800,
    accent: colors.gold,
    inStock: true,
    shipsTo: [],
  },
  {
    id: 'prod-seedkit-01',
    name: 'Real Tree Planting Kit',
    category: 'home',
    blurb: 'Plant the physical counterpart of a tree in your garden. Includes soil pods.',
    priceUsd: 45,
    priceAlli: 3_400,
    accent: colors.greenDim,
    inStock: false,
    shipsTo: ['TH', 'SG', 'MY'],
  },
  {
    id: 'prod-socks-01',
    name: 'Merino Run Socks (3pk)',
    category: 'apparel',
    blurb: 'Blister-resistant merino blend, cushioned heel.',
    priceUsd: 26,
    priceAlli: 2_050,
    accent: colors.ink2,
    inStock: true,
    shipsTo: [],
  },
];

export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === productId);
}

export const CATEGORY_LABELS: Record<Product['category'], string> = {
  gear: 'Gear',
  apparel: 'Apparel',
  wellness: 'Wellness',
  home: 'Home',
};
