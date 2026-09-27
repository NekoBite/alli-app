import { randomInt } from 'node:crypto';

import { pool, transaction } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import {
  PRODUCTS,
  cartTotals,
  findProduct,
  stockOf,
  type CartLine,
  type PaymentMethod,
  type ShippingAddress,
} from '../shared/commerce.ts';

type OrderRow = {
  id: string;
  number: string;
  method: PaymentMethod;
  lines: CartLine[];
  total: string;
  shipping: string;
  stars_back: string;
  status: string;
  address: ShippingAddress;
  tx_hash: string | null;
  tracking_number: string | null;
  created_at: Date;
};

/** The app's Order shape (src/features/market/types.ts). */
function view(r: OrderRow) {
  return {
    id: r.id,
    number: r.number,
    createdAt: r.created_at.getTime(),
    lines: r.lines,
    method: r.method,
    total: Number(r.total),
    shipping: Number(r.shipping),
    starsBack: Number(r.stars_back),
    status: r.status,
    txHash: r.tx_hash ?? undefined,
    trackingNumber: r.tracking_number ?? undefined,
    address: r.address,
  };
}

export function listProducts() {
  return PRODUCTS;
}

/**
 * Creates an order in pending-payment, priced from the catalogue here — the client's line prices
 * are never read. Payment is a separate step: a signed `order` intent through the PaymentRouter,
 * after which the chain watcher marks it paid (src/payments/service.ts).
 */
export async function createOrder(userId: string, input: { lines: CartLine[]; method: PaymentMethod; address: ShippingAddress }) {
  const priced = input.lines.map((line) => {
    const product = findProduct(line.productId);
    if (!product) throw ApiError.badRequest('unknown_product', `Unknown product: ${line.productId}.`);
    if (product.variants?.length && !line.variantId) {
      throw ApiError.badRequest('variant_required', `Pick a size for ${product.name}.`);
    }
    if (stockOf(product, line.variantId) < line.quantity) {
      throw ApiError.conflict('out_of_stock', `${product.name} is out of stock.`);
    }
    if (product.shipsTo.length && !product.shipsTo.includes(input.address.country.toUpperCase())) {
      throw ApiError.badRequest('no_shipping', `${product.name} does not ship to ${input.address.country}.`);
    }
    return { product, quantity: line.quantity };
  });
  const totals = cartTotals(priced, input.method);

  return transaction(async (db) => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const number = `ALLI-${randomInt(10_000, 99_999)}`;
      const { rows } = await db.query<OrderRow>(
        `INSERT INTO orders (number, user_id, method, lines, subtotal, shipping, total, stars_back, address)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (number) DO NOTHING
         RETURNING *`,
        [
          number,
          userId,
          input.method,
          JSON.stringify(input.lines),
          totals.subtotal,
          totals.shipping,
          totals.total,
          Math.round(totals.starsBack * 100) / 100,
          JSON.stringify(input.address),
        ],
      );
      if (rows[0]) return view(rows[0]);
    }
    throw new Error('Could not allocate an order number.');
  });
}

export async function listOrders(userId: string) {
  const { rows } = await pool.query<OrderRow>('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]);
  return rows.map(view);
}

export async function getOrder(userId: string, orderId: string) {
  const { rows } = await pool.query<OrderRow>('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [orderId, userId]);
  if (!rows[0]) throw ApiError.notFound('order_not_found', 'Order not found.');
  return view(rows[0]);
}
