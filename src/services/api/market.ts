import { isMock } from '@/config/env';
import { findProduct, PRODUCTS, stockOf } from '@/features/market/catalog';
import { cartTotals } from '@/features/market/rules';
import type {
  CartLine,
  Order,
  PaymentMethod,
  Product,
  ShippingAddress,
} from '@/features/market/types';
import { delay, request } from './client';
import { payIntent } from './payments';

export type CreateOrderInput = {
  lines: CartLine[];
  method: PaymentMethod;
  address: ShippingAddress;
};

export interface MarketApi {
  getProducts(): Promise<Product[]>;
  getOrders(): Promise<Order[]>;
  /**
   * Creates the order and returns it in `pending-payment`. Settlement is a
   * separate step: the app pays the returned address on-chain, the backend
   * watches for the transfer and flips the order to `paid`. Never mark an order
   * paid from the client.
   */
  createOrder(input: CreateOrderInput): Promise<Order>;
  /**
   * Pays a pending order: fetches its signed payment intent, sends the BEP-20 payment through the
   * payment router, and waits until the server's chain watcher has seen it. Returns the order as
   * the server now has it (`paid`, with the tx hash).
   */
  payOrder(orderId: string): Promise<Order>;
}

const live: MarketApi = {
  getProducts: () => request('/v1/market/products', { anonymous: true }),
  getOrders: () => request('/v1/market/orders'),
  createOrder: (input) => request('/v1/market/orders', { method: 'POST', body: input }),
  payOrder: async (orderId) => {
    await payIntent({ kind: 'order', orderId });
    return request(`/v1/market/orders/${encodeURIComponent(orderId)}`);
  },
};

let mockOrders: Order[] = [];

const mock: MarketApi = {
  getProducts: () => delay(PRODUCTS),
  getOrders: () => delay([...mockOrders]),

  async createOrder({ lines, method, address }) {
    const priced = lines.map((line) => {
      const product = findProduct(line.productId);
      if (!product) throw new Error(`Unknown product: ${line.productId}`);
      if (stockOf(product, line.variantId) < line.quantity) {
        throw new Error(`${product.name} is out of stock.`);
      }
      if (product.variants?.length && !line.variantId) throw new Error(`Pick a size for ${product.name}.`);
      return { product, quantity: line.quantity };
    });
    const totals = cartTotals(priced, method);

    const order: Order = {
      id: `order-${Date.now()}`,
      number: `ALLI-${20000 + Math.floor(Math.random() * 9999)}`,
      createdAt: Date.now(),
      lines,
      method,
      total: totals.total,
      shipping: totals.shipping,
      starsBack: totals.starsBack,
      status: 'pending-payment',
      address,
    };
    mockOrders = [order, ...mockOrders];
    return delay(order, 700);
  },

  async payOrder(orderId) {
    const order = mockOrders.find((o) => o.id === orderId);
    if (!order) throw new Error('Order not found.');
    const paid: Order = {
      ...order,
      status: 'paid',
      txHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
    };
    mockOrders = mockOrders.map((o) => (o.id === orderId ? paid : o));
    return delay(paid, 1200);
  },
};

export const marketApi: MarketApi = isMock ? mock : live;
