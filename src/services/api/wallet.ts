import { isMock } from '@/config/env';
import type { WalletAccount } from '@/features/wallet/types';
import type { Address, ChainTx } from '@/services/chain';
import { delay, request } from './client';

export interface WalletApi {
  /** The address bound to this account. Created on first sign-in. */
  getAccount(): Promise<WalletAccount>;
  /**
   * Transfer history. Read from an indexer (BscScan API, Covalent, a self-hosted
   * indexer) rather than by scanning blocks from the phone.
   */
  getTransactions(address: Address): Promise<ChainTx[]>;
}

const live: WalletApi = {
  getAccount: () => request('/v1/wallet/account'),
  getTransactions: (address) =>
    request(`/v1/wallet/transactions?address=${encodeURIComponent(address)}`),
};

const MOCK_ADDRESS = '0x7A3f9C21b4E8d05F6c1A8b2D3e4F5a6B7c8D9e01';
const MINUTE = 60_000;

const mock: WalletApi = {
  getAccount: () =>
    delay<WalletAccount>({
      address: MOCK_ADDRESS,
      // Placeholder only — see CustodyModel in src/features/wallet/types.ts.
      custody: 'mpc',
      backedUp: false,
    }),

  getTransactions: () =>
    delay<ChainTx[]>([
      {
        hash: '0xa1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdef123456',
        direction: 'in',
        symbol: 'ALLI',
        amount: '250.0',
        counterparty: '0x0000000000000000000000000000000000001111',
        status: 'confirmed',
        timestamp: Date.now() - 45 * MINUTE,
        memo: 'Points redemption',
      },
      {
        hash: '0xb2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdef12345678',
        direction: 'out',
        symbol: 'USDT',
        amount: '5.0',
        counterparty: '0x0000000000000000000000000000000000002222',
        status: 'confirmed',
        timestamp: Date.now() - 12 * 60 * MINUTE,
        memo: 'Premium seed — Mangrove',
      },
      {
        hash: '0xc3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdef1234567890',
        direction: 'in',
        symbol: 'ALLI',
        amount: '12.0',
        counterparty: '0x0000000000000000000000000000000000003333',
        status: 'confirmed',
        timestamp: Date.now() - 26 * 60 * MINUTE,
        memo: 'Harvest — Acacia',
      },
    ]),
};

export const walletApi: WalletApi = isMock ? mock : live;
