import {
  checkCanStart,
  checkPurchase,
  extraRunsCost,
  membershipRemainingMs,
  remainingPurchasableRuns,
  RUN_CREDIT_RULES,
} from './credits';
import type { RunEntitlement } from './types';

const NOW = 1_700_000_000_000;
const DAY = 86_400_000;

function entitlement(overrides: Partial<RunEntitlement> = {}): RunEntitlement {
  return {
    runsLeft: 10,
    runsThisMonth: 2,
    extraRunsBoughtThisMonth: 0,
    membership: {
      status: 'active',
      activeUntil: NOW + 7 * DAY,
      runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
      priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
    },
    serverTime: NOW,
    ...overrides,
  };
}

describe('extraRunsCost', () => {
  it('prices a batch at the per-run rate', () => {
    expect(extraRunsCost(12)).toBeCloseTo(12 * RUN_CREDIT_RULES.extraRunPriceUsdt, 6);
  });

  it('never costs less than nothing', () => {
    expect(extraRunsCost(-5)).toBe(0);
  });

  it('prices a renewal the same as buying its credits one by one', () => {
    expect(extraRunsCost(RUN_CREDIT_RULES.runsPerRenewal)).toBeCloseTo(
      RUN_CREDIT_RULES.membershipPriceUsdt,
      6,
    );
  });
});

describe('remainingPurchasableRuns', () => {
  it('counts down from the monthly ceiling', () => {
    expect(remainingPurchasableRuns(100)).toBe(RUN_CREDIT_RULES.maxExtraRunsPerMonth - 100);
  });

  it('never goes negative, however the month was counted', () => {
    expect(remainingPurchasableRuns(RUN_CREDIT_RULES.maxExtraRunsPerMonth + 50)).toBe(0);
  });
});

describe('checkPurchase', () => {
  it('allows a purchase inside the ceiling', () => {
    expect(checkPurchase(10, entitlement()).ok).toBe(true);
  });

  it('refuses a fractional or empty purchase', () => {
    expect(checkPurchase(1.5, entitlement()).ok).toBe(false);
    expect(checkPurchase(0, entitlement()).ok).toBe(false);
  });

  it('refuses once the month is spent, and says so', () => {
    const check = checkPurchase(
      1,
      entitlement({ extraRunsBoughtThisMonth: RUN_CREDIT_RULES.maxExtraRunsPerMonth }),
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toContain(String(RUN_CREDIT_RULES.maxExtraRunsPerMonth));
  });

  it('refuses a purchase that would cross the ceiling', () => {
    const check = checkPurchase(
      5,
      entitlement({ extraRunsBoughtThisMonth: RUN_CREDIT_RULES.maxExtraRunsPerMonth - 2 }),
    );
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('2 more runs');
  });
});

describe('checkCanStart', () => {
  it('allows a run while credits remain', () => {
    expect(checkCanStart(entitlement()).ok).toBe(true);
  });

  it('blocks a run with no credits left', () => {
    const check = checkCanStart(entitlement({ runsLeft: 0 }));
    expect(check.ok).toBe(false);
    expect(check.reason).toContain('run credits');
  });

  it('does not care whether the membership lapsed — credits never expire', () => {
    const lapsed = entitlement({
      runsLeft: 3,
      membership: {
        status: 'expired',
        activeUntil: NOW - DAY,
        runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
        priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
      },
    });
    expect(checkCanStart(lapsed).ok).toBe(true);
  });
});

describe('membershipRemainingMs', () => {
  it('measures against the server clock, not the phone', () => {
    expect(membershipRemainingMs(entitlement())).toBe(7 * DAY);
  });

  it('is zero once it has lapsed', () => {
    const lapsed = entitlement({
      membership: {
        status: 'expired',
        activeUntil: NOW - DAY,
        runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
        priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
      },
    });
    expect(membershipRemainingMs(lapsed)).toBe(0);
  });
});
