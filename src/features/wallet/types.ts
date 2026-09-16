import type { Address, ChainTx, TokenBalance } from '@/services/chain';

/**
 * How the private key is held. This is the single most consequential decision in
 * the app and it is deliberately left unmade in the scaffold.
 *
 * - `custodial`   — a licensed partner holds keys. Simplest UX, heaviest
 *                   regulatory load (you are holding client assets).
 * - `self`        — key generated on-device, encrypted in the Keychain/Keystore.
 *                   No custody risk for you, but a lost phone is a lost wallet
 *                   unless recovery is designed.
 * - `mpc`         — threshold signing split between device and server (Web3Auth,
 *                   Privy, Turnkey…). Usually the right answer for a consumer app.
 * - `walletconnect` — the user brings their own wallet. No custody at all, but
 *                   rules out a card and makes onboarding much harder.
 */
export type CustodyModel = 'custodial' | 'self' | 'mpc' | 'walletconnect';

export type WalletAccount = {
  address: Address;
  custody: CustodyModel;
  /** True once the user has completed whatever backup the custody model needs. */
  backedUp: boolean;
};

export type CardStatus =
  | 'not-requested'
  | 'kyc-required'
  | 'kyc-pending'
  | 'kyc-rejected'
  | 'ordered'
  | 'shipped'
  | 'active'
  | 'frozen';

export type VisaCard = {
  id: string;
  status: CardStatus;
  /** Last four of the PAN. The full number never reaches this app. */
  last4?: string;
  expiry?: string;
  /** Which token tops the card up when it is swiped. */
  fundingToken: 'ALLI' | 'USDT';
  /** Spendable fiat balance held by the issuer, in USD. */
  availableUsd: number;
  /** Physical card shipping state, when one was ordered. */
  shippingRef?: string;
  frozen: boolean;
};

export type CardTransaction = {
  id: string;
  merchant: string;
  amountUsd: number;
  timestamp: number;
  status: 'authorized' | 'settled' | 'declined' | 'refunded';
  /** The on-chain top-up that funded it, if any. */
  txHash?: string;
};

export type WalletSnapshot = {
  account?: WalletAccount;
  balances: TokenBalance[];
  transactions: ChainTx[];
  card?: VisaCard;
  cardTransactions: CardTransaction[];
};
