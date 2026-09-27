import { Wallet, getAddress } from 'ethers';

import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';
import {
  PAYMENT_INTENT_TYPES,
  PAYMENT_ROUTER_DOMAIN,
  REWARD_CLAIM_DOMAIN,
  REWARD_CLAIM_TYPES,
} from '../shared/commerce.ts';

/**
 * The two signatures the backend issues, over the EIP-712 shapes shared with the contracts
 * (src/services/chain/eip712.ts):
 *
 * - a payment quote, which PaymentRouter accepts as the only valid price;
 * - a reward voucher, which RewardClaim pays out against.
 *
 * Keys come from the environment. In production they belong in a KMS or HSM behind this same
 * interface — the contracts only care that the recovered address holds the role.
 */
export type PaymentsConfig = { router: string; chainId: number; quoteKey: Wallet; usdt?: string; alli?: string };

export function paymentsConfig(): PaymentsConfig | null {
  if (!env.PAYMENT_ROUTER_ADDRESS || !env.QUOTE_SIGNER_PRIVATE_KEY) return null;
  return {
    router: getAddress(env.PAYMENT_ROUTER_ADDRESS),
    chainId: env.CHAIN_ID,
    quoteKey: new Wallet(env.QUOTE_SIGNER_PRIVATE_KEY),
    usdt: env.USDT_TOKEN_ADDRESS ? getAddress(env.USDT_TOKEN_ADDRESS) : undefined,
    alli: env.ALLI_TOKEN_ADDRESS ? getAddress(env.ALLI_TOKEN_ADDRESS) : undefined,
  };
}

export function requirePayments(): PaymentsConfig {
  const config = paymentsConfig();
  if (!config) {
    throw ApiError.unavailable(
      'payments_unavailable',
      'Payments are not open yet: the payment router is not configured on this server.',
    );
  }
  return config;
}

export type QuotedIntent = {
  id: string;
  payer: string;
  token: string;
  amount: bigint;
  kind: number;
  deadline: number;
};

export async function signQuote(config: PaymentsConfig, intent: QuotedIntent): Promise<string> {
  return config.quoteKey.signTypedData(
    { ...PAYMENT_ROUTER_DOMAIN, chainId: config.chainId, verifyingContract: config.router },
    PAYMENT_INTENT_TYPES,
    intent,
  );
}

export type Voucher = { user: string; amount: bigint; nonce: bigint; deadline: number };

export async function signVoucher(voucher: Voucher): Promise<string> {
  const key = env.VOUCHER_SIGNER_PRIVATE_KEY ?? env.QUOTE_SIGNER_PRIVATE_KEY;
  if (!env.REWARD_CLAIM_ADDRESS || !key) {
    throw ApiError.unavailable('redemption_unavailable', 'Reward vouchers are not configured on this server.');
  }
  return new Wallet(key).signTypedData(
    { ...REWARD_CLAIM_DOMAIN, chainId: env.CHAIN_ID, verifyingContract: getAddress(env.REWARD_CLAIM_ADDRESS) },
    REWARD_CLAIM_TYPES,
    voucher,
  );
}
