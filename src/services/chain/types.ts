import type { TokenSymbol } from './config';

export type Address = string;

export type TokenBalance = {
  symbol: TokenSymbol;
  /** Raw on-chain integer, as a decimal string (wei-style). */
  raw: string;
  decimals: number;
  /** Human-readable amount, e.g. "12.4501". */
  formatted: string;
};

export type TxStatus = 'pending' | 'confirmed' | 'failed';

export type TxDirection = 'in' | 'out';

export type ChainTx = {
  hash: string;
  direction: TxDirection;
  symbol: TokenSymbol;
  /** Human-readable amount. */
  amount: string;
  counterparty: Address;
  status: TxStatus;
  timestamp: number;
  /** Set for app-originated transfers so the UI can label them. */
  memo?: string;
};

export type FeeEstimate = {
  /** Human-readable BNB cost. */
  bnb: string;
  gasLimit: string;
  gasPriceWei: string;
};

/**
 * Everything the app needs from a chain. `MockChainClient` implements it with
 * fixtures; `EthersChainClient` implements the read half against a real RPC.
 * Screens depend on this interface, never on ethers directly.
 */
export interface ChainClient {
  getBalance(address: Address, symbol: TokenSymbol): Promise<TokenBalance>;
  getBalances(address: Address): Promise<TokenBalance[]>;
  estimateTransferFee(symbol: TokenSymbol): Promise<FeeEstimate>;
  /** Requires a signer. Throws until the wallet's signing path is wired up. */
  transfer(args: {
    to: Address;
    symbol: TokenSymbol;
    /** Human-readable amount; the client converts using the token's decimals. */
    amount: string;
  }): Promise<{ hash: string }>;
}
