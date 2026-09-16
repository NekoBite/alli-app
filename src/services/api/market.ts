import { isMock } from '@/config/env';
import { findProduct, PRODUCTS } from '@/features/market/catalog';
import type {
  CartLine,
  Order,
  PaymentMethod,
  Product,
  ShippingAddress,
} from '@/features/market/types';
import { delay, request } from './client';

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
}

const live: MarketApi = {
  getProducts: () => request('/v1/market/products', { anonymous: true }),
  getOrders: () => request('/v1/market/orders'),
  createOrder: (input) => request('/v1/market/orders', { method: 'POST', body: input }),
};

let mockOrders: Order[] = [];

const mock: MarketApi = {
  getProducts: () => delay(PRODUCTS),
  getOrders: () => delay([...mockOrders]),

  async createOrder({ lines, method, address }) {
    const total = lines.reduce((sum, line) => {
      const product = findProduct(line.productId);
      if (!product) throw new Error(`Unknown product: ${line.productId}`);
      if (!product.inStock) throw new Error(`${product.name} is out of stock.`);
      const unit = method === 'ALLI' ? product.priceAlli : product.priceUsd;
      return sum + unit * line.quantity;
    }, 0);

    const order: Order = {
      id: `order-${Date.now()}`,
      createdAt: Date.now(),
      lines,
      method,
      total,
      status: 'pending-payment',
      address,
    };
    mockOrders = [order, ...mockOrders];
    return delay(order, 900);
  },
};

export const marketApi: MarketApi = isMock ? mock : live;
