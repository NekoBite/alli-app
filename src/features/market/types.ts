import type { TokenSymbol } from '@/services/chain';

export type ProductCategory = 'gear' | 'apparel' | 'wellness' | 'home';

export type Product = {
  id: string;
  name: string;
  category: ProductCategory;
  blurb: string;
  /** Listing price in USD — the reference price everything converts from. */
  priceUsd: number;
  /** Price in ALLI. Below the USD equivalent: paying in ALLI is the discount. */
  priceAlli: number;
  /** Colour token for the placeholder tile until product photography exists. */
  accent: string;
  inStock: boolean;
  /** Where the seller ships to. Empty = worldwide. */
  shipsTo: string[];
  /** Sizes or colours. A product with variants needs one picked before it goes in the cart. */
  variants?: ProductVariant[];
  /** Headline campaign for the featured banner (4.1). */
  featured?: { eyebrow: string; title: string; blurb: string };
};

export type ProductVariant = {
  id: string;
  label: string;
  /** Units left. 0 = sold out; the chip stays visible but cannot be picked. */
  stock: number;
};

export type CartLine = {
  productId: string;
  /** Required when the product has variants. */
  variantId?: string;
  quantity: number;
};

export type PaymentMethod = Extract<TokenSymbol, 'ALLI' | 'USDT'>;

export type ShippingAddress = {
  fullName: string;
  line1: string;
  line2?: string;
  city: string;
  postcode: string;
  country: string;
  phone: string;
};

export type OrderStatus = 'pending-payment' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

export type Order = {
  id: string;
  createdAt: number;
  lines: CartLine[];
  method: PaymentMethod;
  /** Charged amount in the chosen token, shipping included. */
  total: number;
  /** Shipping, in the chosen token. */
  shipping?: number;
  /** Stars the stars-back promo credits once the order is paid. */
  starsBack?: number;
  /** Human-facing order number, e.g. ALLI-20931. */
  number?: string;
  status: OrderStatus;
  /** On-chain payment, once settled. */
  txHash?: string;
  trackingNumber?: string;
  address: ShippingAddress;
};
