import type { RunEntitlement } from './types';

/**
 * Run credits.
 *
 * A run credit is the right to record one run. The membership grants a month's
 * worth on each renewal; extra credits can be bought on top, up to a monthly
 * ceiling. Credits themselves never expire — letting the subscription lapse
 * stops the top-up, it does not confiscate what the account already holds.
 *
 * Credits are what bounds star emission, the same way the daily cap bounds
 * points. Both sets of numbers are placeholders (see `REWARD_RULES`), and both
 * belong on the server before launch so they can be tuned without an app
 * release.
 */
export const RUN_CREDIT_RULES = {
  /** Credits granted by each membership renewal. */
  runsPerRenewal: 30,
  /** Monthly membership price, in USDT. */
  membershipPriceUsdt: 25,
  /**
   * Price of one extra credit, in USDT — the membership price spread over the
   * credits it grants, so buying extra is never cheaper than subscribing.
   */
  extraRunPriceUsdt: 25 / 30,
  /** Extra credits one account may buy per month, on top of the membership. */
  maxExtraRunsPerMonth: 300,
} as const;

export type PayCurrency = 'ALLI' | 'USDT';

/**
 * One-off run packs (wireframe 2.5). The ALLI prices are the wireframe's placeholders — bigger
 * packs are cheaper per run — and, like everything in this file, belong to the server, which
 * quotes the binding price in the payment intent. USDT prices are the per-run price times the pack.
 */
export const RUN_PACKS = [
  { runs: 5, alli: 50 },
  { runs: 10, alli: 90 },
  { runs: 30, alli: 240, bestValue: true },
] as const;

export type RunPack = (typeof RUN_PACKS)[number];

/** Membership renewal in ALLI (wireframe 2.5, "Renew early · 250 ALLI"). Placeholder, server-owned. */
export const MEMBERSHIP_PRICE_ALLI = 250;

/** What a pack costs in the chosen currency. */
export function packPrice(pack: RunPack, currency: PayCurrency): number {
  return currency === 'ALLI' ? pack.alli : extraRunsCost(pack.runs);
}

/** USDT cost of buying `count` extra credits. */
export function extraRunsCost(count: number): number {
  const runs = Math.max(0, Math.floor(count));
  return runs * RUN_CREDIT_RULES.extraRunPriceUsdt;
}

/** How many more credits this account may buy in the current server month. */
export function remainingPurchasableRuns(boughtThisMonth: number): number {
  return Math.max(0, RUN_CREDIT_RULES.maxExtraRunsPerMonth - Math.max(0, boughtThisMonth));
}

export type PurchaseCheck = { ok: boolean; reason?: string };

/**
 * Whether a purchase of `count` credits is allowed. The server decides for
 * real — this is here so the button can explain itself before the round trip.
 */
export function checkPurchase(count: number, entitlement: RunEntitlement): PurchaseCheck {
  if (!Number.isInteger(count) || count <= 0) {
    return { ok: false, reason: 'Buy a whole number of runs.' };
  }

  const remaining = remainingPurchasableRuns(entitlement.extraRunsBoughtThisMonth);
  if (remaining === 0) {
    return {
      ok: false,
      reason: `You have bought this month's limit of ${RUN_CREDIT_RULES.maxExtraRunsPerMonth} extra runs.`,
    };
  }
  if (count > remaining) {
    return { ok: false, reason: `You can buy ${remaining} more run${remaining === 1 ? '' : 's'} this month.` };
  }

  return { ok: true };
}

export type StartCheck = { ok: boolean; reason?: string };

/**
 * Whether a run may be started. The credit is spent server-side when the run is
 * submitted, so this check is UX: it stops someone running 5 km only to be told
 * afterwards that it could not be recorded.
 */
export function checkCanStart(entitlement: RunEntitlement): StartCheck {
  if (entitlement.runsLeft <= 0) {
    return {
      ok: false,
      reason: 'You are out of run credits. Renew your membership or buy extra runs.',
    };
  }
  return { ok: true };
}

/** ms until the membership lapses; 0 once it has. */
export function membershipRemainingMs(entitlement: RunEntitlement): number {
  const until = entitlement.membership.activeUntil;
  if (until === undefined) return 0;
  return Math.max(0, until - entitlement.serverTime);
}
