import { create } from 'zustand';

import { cardApi, walletApi } from '@/services/api';
import { chainClient, type ChainTx, type TokenBalance, type TokenSymbol } from '@/services/chain';
import type { CardTransaction, VisaCard, WalletAccount } from './types';

type WalletState = {
  account?: WalletAccount;
  balances: TokenBalance[];
  transactions: ChainTx[];
  card?: VisaCard;
  cardTransactions: CardTransaction[];
  loading: boolean;
  sending: boolean;
  error?: string;

  load: () => Promise<void>;
  refreshBalances: () => Promise<void>;
  send: (args: { to: string; symbol: TokenSymbol; amount: string }) => Promise<{ hash: string }>;

  startCardApplication: () => Promise<void>;
  setCardFrozen: (frozen: boolean) => Promise<void>;
  topUpCard: (amountUsd: number, from: 'ALLI' | 'USDT') => Promise<void>;

  balanceOf: (symbol: TokenSymbol) => TokenBalance | undefined;
};

export const useWalletStore = create<WalletState>((set, get) => ({
  balances: [],
  transactions: [],
  cardTransactions: [],
  loading: false,
  sending: false,

  async load() {
    set({ loading: true, error: undefined });
    try {
      const account = await walletApi.getAccount();
      const [balances, transactions, card, cardTransactions] = await Promise.all([
        chainClient().getBalances(account.address),
        walletApi.getTransactions(account.address),
        cardApi.getCard(),
        cardApi.getCardTransactions(),
      ]);
      set({ account, balances, transactions, card, cardTransactions, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }
  },

  async refreshBalances() {
    const { account } = get();
    if (!account) return;
    try {
      set({ balances: await chainClient().getBalances(account.address) });
    } catch (error) {
      set({ error: (error as Error).message });
    }
  },

  async send({ to, symbol, amount }) {
    set({ sending: true, error: undefined });
    try {
      const result = await chainClient().transfer({ to, symbol, amount });
      set({ sending: false });
      await get().refreshBalances();
      return result;
    } catch (error) {
      set({ sending: false, error: (error as Error).message });
      throw error;
    }
  },

  async startCardApplication() {
    set({ error: undefined });
    try {
      set({ card: await cardApi.startApplication() });
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  async setCardFrozen(frozen) {
    const { card } = get();
    if (!card) return;
    // Optimistic: freezing has to feel instant — it is what you reach for when a
    // card is lost. The API result still wins.
    set({ card: { ...card, frozen } });
    try {
      set({ card: await cardApi.setFrozen(frozen) });
    } catch (error) {
      set({ card, error: (error as Error).message });
      throw error;
    }
  },

  async topUpCard(amountUsd, from) {
    set({ error: undefined });
    try {
      set({ card: await cardApi.topUp(amountUsd, from) });
      await get().refreshBalances();
    } catch (error) {
      set({ error: (error as Error).message });
      throw error;
    }
  },

  balanceOf(symbol) {
    return get().balances.find((balance) => balance.symbol === symbol);
  },
}));
