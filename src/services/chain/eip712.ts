/**
 * EIP-712 shapes the backend signs and the contracts verify (contracts/src). One definition, used
 * by the server's signers (via server/src/shared), the app, and the contract tests, so a field added on one side and not
 * the other fails a test instead of every signature in production.
 *
 * No imports on purpose: the contracts package (CommonJS, Hardhat) loads this file directly.
 */
export const REWARD_CLAIM_DOMAIN = { name: 'ALLI RewardClaim', version: '1' } as const;

export const REWARD_CLAIM_TYPES = {
  Claim: [
    { name: 'user', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

export const PAYMENT_ROUTER_DOMAIN = { name: 'ALLI PaymentRouter', version: '1' } as const;

export const PAYMENT_INTENT_TYPES = {
  PaymentIntent: [
    { name: 'id', type: 'bytes32' },
    { name: 'payer', type: 'address' },
    { name: 'token', type: 'address' },
    { name: 'amount', type: 'uint256' },
    { name: 'kind', type: 'uint8' },
    { name: 'deadline', type: 'uint256' },
  ],
};

/** `PaymentRouter.KIND_*`; mirrors PAYMENT_KIND_CODE in the app. */
export const PAYMENT_KIND = { runs: 1, membership: 2, seed: 3, shoe: 4, order: 5 } as const;
export type PaymentKind = keyof typeof PAYMENT_KIND;
