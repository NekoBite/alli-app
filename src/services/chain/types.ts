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

/** What a purchase pays for; mirrors `PaymentRouter.Kind` on chain. */
export type PaymentKind = 'runs' | 'membership' | 'seed' | 'shoe' | 'order';

export const PAYMENT_KIND_CODE: Record<PaymentKind, number> = {
  runs: 1,
  membership: 2,
  seed: 3,
  shoe: 4,
  order: 5,
};

/**
 * A server-quoted payment: the exact token and amount, bound to one payer and a deadline, signed
 * by the server's quote key (EIP-712). The router contract rejects any other amount.
 */
export type PaymentIntent = {
  /** bytes32, 0x-prefixed. */
  id: string;
  kind: PaymentKind;
  payer: Address;
  symbol: 'ALLI' | 'USDT';
  token: Address;
  /** Raw integer amount, decimal string. */
  amount: string;
  /** Human-readable amount, for the confirm sheet. */
  formatted: string;
  router: Address;
  /** Unix seconds. */
  deadline: number;
  signature: string;
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
  /**
   * Pays a server-signed intent through the payment router: approves the router for exactly the
   * amount if the allowance is short, then calls `pay`. Requires a signer, like `transfer`.
   */
  payIntent(intent: PaymentIntent): Promise<{ hash: string }>;
}
