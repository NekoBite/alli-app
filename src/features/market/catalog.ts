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
    inStock: true,
    shipsTo: [],
  },
  {
    id: 'prod-tee-01',
    name: 'ALLI Run Tee',
    category: 'apparel',
    blurb: 'Breathable recycled-poly running tee with the ALLI mark. Limited Genesis run of 500.',
    priceUsd: 32,
    priceAlli: 2_500,
    inStock: true,
    shipsTo: [],
    variants: [
      { id: 's', label: 'S', stock: 12 },
      { id: 'm', label: 'M', stock: 38 },
      { id: 'l', label: 'L', stock: 21 },
      { id: 'xl', label: 'XL', stock: 0 },
    ],
    featured: {
      eyebrow: 'Genesis drop',
      title: 'ALLI Run Tee · Limited',
      blurb: 'Pay in ALLI, get 10% back in stars.',
    },
  },
  {
    id: 'prod-band-01',
    name: 'Recovery Band Set',
    category: 'wellness',
    blurb: 'Three resistance levels for post-run mobility work.',
    priceUsd: 22,
    priceAlli: 1_800,
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
    inStock: true,
    shipsTo: [],
    variants: [
      { id: 's', label: 'S', stock: 9 },
      { id: 'm', label: 'M', stock: 14 },
      { id: 'l', label: 'L', stock: 6 },
    ],
  },
];

export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find((product) => product.id === productId);
}

/** Units left of a product (or one of its variants). */
export function stockOf(product: Product, variantId?: string): number {
  if (!product.inStock) return 0;
  if (!product.variants?.length) return 99;
  if (!variantId) return product.variants.reduce((sum, v) => sum + v.stock, 0);
  return product.variants.find((v) => v.id === variantId)?.stock ?? 0;
}

export const CATEGORY_LABELS: Record<Product['category'], string> = {
  gear: 'Gear',
  apparel: 'Apparel',
  wellness: 'Wellness',
  home: 'Home',
};
