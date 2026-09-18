import { isMock } from '@/config/env';
import { RUN_CREDIT_RULES, extraRunsCost } from '@/features/run/credits';
import { calculateReward, starsToAlli } from '@/features/run/rewards';
import { DEFAULT_SHOE_TIER, type ShoeTier } from '@/features/run/shoes';
import { creditStepSamples } from '@/features/run/steps';
import type { RunEntitlement, RunSession, RunSummary } from '@/features/run/types';
import { dayKey } from '@/utils/time';
import { delay, request } from './client';
import { mockQuests } from './mockQuests';
import { mockStars } from './mockStars';

/** What the account has earned, as the ledger sees it. */
export type RunProfile = {
  /** Stars held, exchangeable for ALLI. */
  starsBalance: number;
  /** Stars today's quest has paid. Non-zero means today is done. */
  starsEarnedToday: number;
  /** GPS-credited steps banked today, across every run. */
  stepsToday: number;
  /** Consecutive days the quest was completed. */
  streakDays: number;
  /** The NFT footwear tier the account holds — what scales the quest reward. */
  shoeTier: ShoeTier;
};

export type StarExchangeResult = {
  txHash: string;
  alli: number;
  /** The star balance as it stands after the exchange — no second round trip. */
  starsBalance: number;
};

export interface RunApi {
  /** Stars, today's quest progress and the shoe tier, for the runner's local day. */
  getProfile(day: string): Promise<RunProfile>;
  /**
   * Run credits and membership. Separate from the profile because it is counted
   * on the server's clock, not the runner's local day.
   */
  getEntitlement(): Promise<RunEntitlement>;
  getHistory(): Promise<RunSummary[]>;
  /**
   * Uploads the raw track. The server re-runs validation and returns the
   * authoritative reward — the client's own figure is only a preview. Accepting
   * the run is also what spends a run credit.
   */
  submitRun(session: RunSession, rejectedPoints: number): Promise<RunSummary>;
  /**
   * Burns stars and sends the matching ALLI on-chain.
   *
   * `toAddress` is explicit rather than looked up server-side: the backend
   * stores a wallet address per account, but paying out to a stale one because
   * the device changed wallets is not a mistake you can take back.
   */
  exchangeStars(stars: number, toAddress: string): Promise<StarExchangeResult>;
  /**
   * Buys extra run credits.
   *
   * The price and the monthly ceiling are enforced server-side; the copies in
   * `RUN_CREDIT_RULES` exist so the screen can show a total before the round
   * trip. How the USDT is actually collected follows the custody decision in
   * README §1 — until that is made, the mock simply grants the credits.
   */
  buyRuns(count: number): Promise<RunEntitlement>;
  /** Renews the membership for another month and grants its run credits. */
  renewMembership(): Promise<RunEntitlement>;
}

const live: RunApi = {
  getProfile: (day) => request(`/v1/run/profile?day=${encodeURIComponent(day)}`),
  getEntitlement: () => request('/v1/run/entitlement'),
  getHistory: () => request('/v1/run/runs'),

  /**
   * Sends the raw track and nothing else that matters.
   *
   * Note what is deliberately NOT in this body: distance, moving time, the
   * rejected-fix count, the credited step count, the day's running total, the
   * shoe multiplier and the stars the screen showed. The server recomputes all
   * of them from `track` and `stepSamples` with the same functions that produced
   * the on-screen preview, so there is nowhere for a modified client to put a
   * better number. The pedometer's raw totals have to be sent — the server
   * cannot read the sensor — but they are re-credited against the ground the
   * track says was covered, so a fabricated total buys nothing.
   * `rejectedPoints` stays in the signature only because the mock needs it to
   * reproduce the preview offline.
   */
  submitRun: (session) =>
    request('/v1/run/runs', {
      method: 'POST',
      body: {
        clientRunId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        track: session.track,
        stepSamples: session.stepSamples,
        // The runner's local day, so the quest resets at their midnight.
        day: dayKey(new Date(session.startedAt)),
      },
    }),

  exchangeStars: (stars, toAddress) =>
    request('/v1/run/stars/exchange', {
      method: 'POST',
      body: { stars, toAddress, day: dayKey() },
    }),

  buyRuns: (count) => request('/v1/run/credits', { method: 'POST', body: { runs: count } }),

  renewMembership: () => request('/v1/run/membership/renew', { method: 'POST' }),
};

let mockProfile: RunProfile = {
  starsBalance: mockStars.balance(),
  starsEarnedToday: 0,
  stepsToday: 0,
  streakDays: 4,
  // The tier every account starts on, issued free at registration.
  shoeTier: DEFAULT_SHOE_TIER,
};

const DAY_MS = 86_400_000;

let mockEntitlement: RunEntitlement = {
  runsLeft: 68,
  runsThisMonth: 0,
  extraRunsBoughtThisMonth: 0,
  membership: {
    status: 'active',
    activeUntil: Date.now() + 14 * DAY_MS,
    runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
    priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
  },
  serverTime: Date.now(),
};

let mockHistory: RunSummary[] = [];

/** The entitlement as the server would report it now, with a fresh clock. */
function readEntitlement(): RunEntitlement {
  const now = Date.now();
  const { membership } = mockEntitlement;
  const expired = membership.activeUntil !== undefined && membership.activeUntil <= now;
  return {
    ...mockEntitlement,
    membership: { ...membership, status: expired ? 'expired' : membership.status },
    serverTime: now,
  };
}

const mock: RunApi = {
  getProfile: () => delay({ ...mockProfile, starsBalance: mockStars.balance() }),
  getEntitlement: () => delay(readEntitlement()),
  getHistory: () => delay([...mockHistory]),

  async submitRun(session, rejectedPoints) {
    // Re-credited from the raw samples, exactly as the server does it — so the
    // mock is not a kinder judge than production.
    const steps = creditStepSamples(session.track, session.stepSamples ?? []).steps;
    const reward = calculateReward(
      { ...session, steps },
      {
        stepsToday: mockProfile.stepsToday,
        starsEarnedToday: mockProfile.starsEarnedToday,
        shoeTier: mockProfile.shoeTier,
        rejectedPoints,
      },
    );
    // Samples are not echoed back, the same way the server does not return the
    // raw track: they were inputs to the decision, not part of the receipt.
    const summary: RunSummary = {
      ...session,
      steps,
      stepSamples: undefined,
      reward,
      confirmed: true,
    };
    mockHistory = [summary, ...mockHistory];
    // Credited steps count towards a community step quest.
    if (reward.eligibleSteps > 0) mockQuests.record('steps', reward.eligibleSteps);
    mockProfile = {
      ...mockProfile,
      starsBalance: mockStars.credit(reward.stars),
      starsEarnedToday: mockProfile.starsEarnedToday + reward.stars,
      stepsToday: reward.stepsToday,
    };
    // A recorded run costs a credit whatever it earned, which is what "runs
    // left" means. The server does this inside the same transaction that
    // writes the run, so a retried upload cannot spend two.
    mockEntitlement = {
      ...mockEntitlement,
      runsLeft: Math.max(0, mockEntitlement.runsLeft - 1),
      runsThisMonth: mockEntitlement.runsThisMonth + 1,
    };
    return delay(summary, 700);
  },

  async exchangeStars(stars) {
    const count = Math.floor(stars);
    if (count <= 0) throw new Error('Exchange a whole number of stars.');
    const starsBalance = mockStars.debit(count);
    mockProfile = { ...mockProfile, starsBalance };
    return delay(
      {
        txHash: `0xmock${Date.now().toString(16).padStart(60, '0')}`,
        alli: starsToAlli(count),
        starsBalance,
      },
      900,
    );
  },

  async buyRuns(count) {
    const runs = Math.floor(count);
    const remaining =
      RUN_CREDIT_RULES.maxExtraRunsPerMonth - mockEntitlement.extraRunsBoughtThisMonth;
    if (runs <= 0) throw new Error('Buy a whole number of runs.');
    if (runs > remaining) throw new Error(`You can buy ${remaining} more runs this month.`);

    // TODO: this is where the USDT charge happens server-side. Nothing is
    // debited here — see README §1 before wiring a real payment.
    void extraRunsCost(runs);
    mockEntitlement = {
      ...mockEntitlement,
      runsLeft: mockEntitlement.runsLeft + runs,
      extraRunsBoughtThisMonth: mockEntitlement.extraRunsBoughtThisMonth + runs,
    };
    return delay(readEntitlement(), 700);
  },

  async renewMembership() {
    const now = Date.now();
    const current = mockEntitlement.membership.activeUntil ?? now;
    // Renewing early extends rather than restarts — the reference app opens
    // renewal on the expiry date, but losing paid-for days to an early tap is
    // the kind of thing users file tickets about.
    const from = Math.max(now, current);
    mockEntitlement = {
      ...mockEntitlement,
      runsLeft: mockEntitlement.runsLeft + RUN_CREDIT_RULES.runsPerRenewal,
      membership: {
        ...mockEntitlement.membership,
        status: 'active',
        activeUntil: from + 30 * DAY_MS,
      },
    };
    return delay(readEntitlement(), 900);
  },
};

export const runApi: RunApi = isMock ? mock : live;
