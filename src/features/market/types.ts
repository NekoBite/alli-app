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
};

export type CartLine = {
  productId: string;
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
  /** Charged amount in the chosen token. */
  total: number;
  status: OrderStatus;
  /** On-chain payment, once settled. */
  txHash?: string;
  trackingNumber?: string;
  address: ShippingAddress;
};
