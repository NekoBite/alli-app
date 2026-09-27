import { create } from 'zustand';

import { isMock } from '@/config/env';
import { marketApi } from '@/services/api';
import { findProduct } from './catalog';
import { cartTotals, type Totals } from './rules';
import type { CartLine, Order, PaymentMethod, Product, ShippingAddress } from './types';

export type CartEntry = CartLine & { product: Product; key: string };

/** A cart line is one product in one variant. */
export const lineKey = (line: Pick<CartLine, 'productId' | 'variantId'>) =>
  line.variantId ? `${line.productId}:${line.variantId}` : line.productId;

type MarketState = {
  cart: CartLine[];
  /** The cart's currency toggle (4.3); checkout pays in it. */
  currency: PaymentMethod;
  /** Lines ticked for "Remove selected". */
  selected: string[];
  orders: Order[];
  address?: ShippingAddress;
  placing: boolean;
  error?: string;

  add: (productId: string, variantId?: string, quantity?: number) => void;
  setQuantity: (key: string, quantity: number) => void;
  remove: (key: string) => void;
  toggleSelected: (key: string) => void;
  removeSelected: () => void;
  clear: () => void;
  setCurrency: (currency: PaymentMethod) => void;
  setAddress: (address: ShippingAddress) => void;

  entries: () => CartEntry[];
  itemCount: () => number;
  totals: (method?: PaymentMethod) => Totals;

  refreshOrders: () => Promise<void>;
  /** Creates the order in pending-payment. Payment is a separate, on-chain step. */
  checkout: (method?: PaymentMethod) => Promise<Order>;
  /** Pays a pending order through the payment router; resolves once the server sees it confirmed. */
  pay: (orderId: string) => Promise<Order>;
};

/** Mock mode starts with a saved address, as a returning member would have (4.4). */
const DEMO_ADDRESS: ShippingAddress = {
  fullName: 'Alli B.',
  line1: '123 Sukhumvit Rd',
  city: 'Khlong Toei, Bangkok',
  postcode: '10110',
  country: 'TH',
  phone: '+66 8x xxx xxxx',
};

export const useMarketStore = create<MarketState>((set, get) => ({
  address: isMock ? DEMO_ADDRESS : undefined,
  cart: [],
  currency: 'ALLI',
  selected: [],
  orders: [],
  placing: false,

  add(productId, variantId, quantity = 1) {
    const key = lineKey({ productId, variantId });
    set((state) => {
      const existing = state.cart.find((line) => lineKey(line) === key);
      if (!existing) return { cart: [...state.cart, { productId, variantId, quantity }] };
      return {
        cart: state.cart.map((line) =>
          lineKey(line) === key ? { ...line, quantity: line.quantity + quantity } : line,
        ),
      };
    });
  },

  setQuantity(key, quantity) {
    if (quantity <= 0) return get().remove(key);
    set((state) => ({
      cart: state.cart.map((line) => (lineKey(line) === key ? { ...line, quantity } : line)),
    }));
  },

  remove(key) {
    set((state) => ({
      cart: state.cart.filter((line) => lineKey(line) !== key),
      selected: state.selected.filter((k) => k !== key),
    }));
  },

  toggleSelected(key) {
    set((state) => ({
      selected: state.selected.includes(key)
        ? state.selected.filter((k) => k !== key)
        : [...state.selected, key],
    }));
  },

  removeSelected() {
    set((state) => ({
      cart: state.cart.filter((line) => !state.selected.includes(lineKey(line))),
      selected: [],
    }));
  },

  clear() {
    set({ cart: [], selected: [] });
  },

  setCurrency(currency) {
    set({ currency });
  },

  setAddress(address) {
    set({ address });
  },

  entries() {
    return get()
      .cart.map((line) => {
        const product = findProduct(line.productId);
        return product ? { ...line, product, key: lineKey(line) } : null;
      })
      .filter((entry): entry is CartEntry => entry !== null);
  },

  itemCount() {
    return get().cart.reduce((sum, line) => sum + line.quantity, 0);
  },

  totals(method) {
    return cartTotals(get().entries(), method ?? get().currency);
  },

  async refreshOrders() {
    try {
      set({ orders: await marketApi.getOrders() });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async checkout(method) {
    const { cart, address, currency } = get();
    if (cart.length === 0) throw new Error('Your cart is empty.');
    if (!address) throw new Error('Add a shipping address before checking out.');

    set({ placing: true, error: undefined });
    try {
      const order = await marketApi.createOrder({ lines: cart, method: method ?? currency, address });
      set((state) => ({ orders: [order, ...state.orders], placing: false }));
      return order;
    } catch (error) {
      set({ placing: false, error: (error as Error).message });
      throw error;
    }
  },

  async pay(orderId) {
    set({ placing: true, error: undefined });
    try {
      const order = await marketApi.payOrder(orderId);
      set((state) => ({
        orders: state.orders.map((o) => (o.id === order.id ? order : o)),
        cart: [],
        selected: [],
        placing: false,
      }));
      return order;
    } catch (error) {
      set({ placing: false, error: (error as Error).message });
      throw error;
    }
  },
}));
