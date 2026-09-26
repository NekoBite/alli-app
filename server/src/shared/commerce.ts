/**
 * The pricing and referral rules the server shares with the app, through the same single door as
 * run.ts and garden.ts. The app shows these numbers as previews; the server quotes them into signed
 * payment intents, which are the only prices the PaymentRouter contract accepts.
 */
export {
  RUN_CREDIT_RULES,
  RUN_PACKS,
  MEMBERSHIP_PRICE_ALLI,
  extraRunsCost,
  remainingPurchasableRuns,
  type PayCurrency,
} from '../../../src/features/run/credits.ts';

export { SHOE_PRICE_USDT, SHOE_ORDER, SHOES, type ShoeTier } from '../../../src/features/run/shoes.ts';

export { PRODUCTS, findProduct, stockOf } from '../../../src/features/market/catalog.ts';
export { cartTotals, MARKET_RULES } from '../../../src/features/market/rules.ts';
export type { CartLine, PaymentMethod, ShippingAddress } from '../../../src/features/market/types.ts';

export {
  REFERRAL_RULES,
  PROGRAM_ORDER,
  splitCommission,
  inviteLink,
  makeInviteCode,
  maskEmail,
  type UplineMember,
} from '../../../src/features/referrals/rules.ts';
export type {
  DownlineMember,
  ProgramDetail,
  ProgramStatus,
  ReferralHub,
  ReferralProgramId,
} from '../../../src/features/referrals/types.ts';

export {
  PAYMENT_INTENT_TYPES,
  PAYMENT_KIND,
  PAYMENT_ROUTER_DOMAIN,
  REWARD_CLAIM_DOMAIN,
  REWARD_CLAIM_TYPES,
  type PaymentKind,
} from '../../../src/services/chain/eip712.ts';
