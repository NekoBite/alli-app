import { create } from 'zustand';

import { marketApi } from '@/services/api';
import { findProduct } from './catalog';
import type { CartLine, Order, PaymentMethod, Product, ShippingAddress } from './types';

export type CartEntry = CartLine & { product: Product };

type MarketState = {
  cart: CartLine[];
  orders: Order[];
  address?: ShippingAddress;
  placing: boolean;
  error?: string;

  add: (productId: string, quantity?: number) => void;
  setQuantity: (productId: string, quantity: number) => void;
  remove: (productId: string) => void;
  clear: () => void;
  setAddress: (address: ShippingAddress) => void;

  entries: () => CartEntry[];
  itemCount: () => number;
  /** Cart total in the given currency. */
  total: (method: PaymentMethod) => number;

  refreshOrders: () => Promise<void>;
  checkout: (method: PaymentMethod) => Promise<Order>;
};

export const useMarketStore = create<MarketState>((set, get) => ({
  cart: [],
  orders: [],
  placing: false,

  add(productId, quantity = 1) {
    set((state) => {
      const existing = state.cart.find((line) => line.productId === productId);
      if (!existing) return { cart: [...state.cart, { productId, quantity }] };
      return {
        cart: state.cart.map((line) =>
          line.productId === productId ? { ...line, quantity: line.quantity + quantity } : line,
        ),
      };
    });
  },

  setQuantity(productId, quantity) {
    if (quantity <= 0) return get().remove(productId);
    set((state) => ({
      cart: state.cart.map((line) => (line.productId === productId ? { ...line, quantity } : line)),
    }));
  },

  remove(productId) {
    set((state) => ({ cart: state.cart.filter((line) => line.productId !== productId) }));
  },

  clear() {
    set({ cart: [] });
  },

  setAddress(address) {
    set({ address });
  },

  entries() {
    return get()
      .cart.map((line) => {
        const product = findProduct(line.productId);
        return product ? { ...line, product } : null;
      })
      .filter((entry): entry is CartEntry => entry !== null);
  },

  itemCount() {
    return get().cart.reduce((sum, line) => sum + line.quantity, 0);
  },

  total(method) {
    return get().entries().reduce((sum, { product, quantity }) => {
      const unit = method === 'ALLI' ? product.priceAlli : product.priceUsd;
      return sum + unit * quantity;
    }, 0);
  },

  async refreshOrders() {
    try {
      set({ orders: await marketApi.getOrders() });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async checkout(method) {
    const { cart, address } = get();
    if (cart.length === 0) throw new Error('Your cart is empty.');
    if (!address) throw new Error('Add a shipping address before checking out.');

    set({ placing: true, error: undefined });
    try {
      const order = await marketApi.createOrder({ lines: cart, method, address });
      set((state) => ({ orders: [order, ...state.orders], cart: [], placing: false }));
      return order;
    } catch (error) {
      set({ placing: false, error: (error as Error).message });
      throw error;
    }
  },
}));
