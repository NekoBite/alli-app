import { REWARD_RULES } from '../run/rewards';
import type { PaymentMethod, Product } from './types';

/**
 * Marketplace pricing rules. Placeholders the server owns: the order the server creates carries the
 * binding totals, and the payment intent it signs is the only price the contract accepts.
 */
export const MARKET_RULES = {
  /** Flat shipping per order, by currency (wireframe 4.3: 80 ALLI). */
  shipping: { ALLI: 80, USDT: 2.5 } as Record<PaymentMethod, number>,
  /** Stars-back promo on orders paid in ALLI: this share of the ALLI subtotal, returned as stars. */
  starsBackRate: 0.1,
  /** Days after delivery before an order is final (and its referral commission payable). */
  returnWindowDays: 14,
} as const;

export function unitPrice(product: Product, method: PaymentMethod): number {
  return method === 'ALLI' ? product.priceAlli : product.priceUsd;
}

export type Totals = { subtotal: number; shipping: number; starsBack: number; total: number };

/** Cart totals in one currency. An empty cart ships nothing. */
export function cartTotals(
  lines: readonly { product: Product; quantity: number }[],
  method: PaymentMethod,
): Totals {
  const subtotal = lines.reduce((sum, l) => sum + unitPrice(l.product, method) * l.quantity, 0);
  const shipping = lines.length ? MARKET_RULES.shipping[method] : 0;
  // Stars back is an ALLI promo: the rebate is valued in ALLI and paid in stars at the exchange rate.
  const starsBack =
    method === 'ALLI' ? (subtotal * MARKET_RULES.starsBackRate) / REWARD_RULES.alliPerStar : 0;
  return { subtotal, shipping, starsBack, total: subtotal + shipping };
}
