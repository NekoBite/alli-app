import { isMock } from '@/config/env';
import { calculateReward, pointsToAlli, starsToAlli } from '@/features/run/rewards';
import { creditStepSamples } from '@/features/run/steps';
import { RUN_CREDIT_RULES, extraRunsCost } from '@/features/run/credits';
import type { RunEntitlement, RunSession, RunSummary } from '@/features/run/types';
import { dayKey } from '@/utils/time';
import { delay, request } from './client';

export type RunProfile = {
  pointsBalance: number;
  pointsEarnedToday: number;
  multiplier: number;
  streakDays: number;
};

export type StarExchangeResult = {
  txHash: string;
  alli: number;
  /** The balances as they stand after the exchange — no second round trip. */
  entitlement: RunEntitlement;
};

export interface RunApi {
  getProfile(day: string): Promise<RunProfile>;
  /**
   * Run credits, stars and membership. Separate from the profile because it is
   * counted on the server's clock, not the runner's local day.
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
   * Burns points and sends the matching ALLI on-chain.
   *
   * `toAddress` is explicit rather than looked up server-side: the backend
   * stores a wallet address per account, but paying out to a stale one because
   * the device changed wallets is not a mistake you can take back.
   */
  redeemPoints(points: number, toAddress: string): Promise<{ txHash: string; alli: number }>;
  /**
   * Buys extra run credits.
   *
   * The price and the monthly ceiling are enforced server-side; the copies in
   * `RUN_CREDIT_RULES` exist so the screen can show a total before the round
   * trip. How the USDT is actually collected follows the custody decision in
   * README §1 — until that is made, the mock simply grants the credits.
   */
  buyRuns(count: number): Promise<RunEntitlement>;
  /** Exchanges stars for ALLI on-chain, at `REWARD_RULES.alliPerStar`. */
  exchangeStars(stars: number, toAddress: string): Promise<StarExchangeResult>;
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
   * rejected-fix count, the credited step count, and the points and stars the
   * screen showed. The server recomputes all of them from `track` and
   * `stepSamples` with the same functions that produced the on-screen preview,
   * so there is nowhere for a modified client to put a better number. The
   * pedometer's raw totals have to be sent — the server cannot read the sensor —
   * but they are re-credited against the ground the track says was covered, so
   * a fabricated total buys nothing. `rejectedPoints` stays in the signature
   * only because the mock needs it to reproduce the preview offline.
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
        // The runner's local day, so the daily cap resets at their midnight.
        day: dayKey(new Date(session.startedAt)),
      },
    }),

  redeemPoints: (points, toAddress) =>
    request('/v1/run/redeem', {
      method: 'POST',
      body: { points, toAddress, day: dayKey() },
    }),

  buyRuns: (count) => request('/v1/run/credits', { method: 'POST', body: { runs: count } }),

  exchangeStars: (stars, toAddress) =>
    request('/v1/run/stars/exchange', { method: 'POST', body: { stars, toAddress } }),

  renewMembership: () => request('/v1/run/membership/renew', { method: 'POST' }),
};

let mockProfile: RunProfile = {
  pointsBalance: 2_450,
  pointsEarnedToday: 180,
  multiplier: 1.05,
  streakDays: 4,
};

const DAY_MS = 86_400_000;

let mockEntitlement: RunEntitlement = {
  runsLeft: 68,
  runsThisMonth: 0,
  extraRunsBoughtThisMonth: 0,
  stars: 3,
  starsToday: 0,
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
  getProfile: () => delay({ ...mockProfile }),
  getEntitlement: () => delay(readEntitlement()),
  getHistory: () => delay([...mockHistory]),

  async submitRun(session, rejectedPoints) {
    // Re-credited from the raw samples, exactly as the server does it — so the
    // mock is not a kinder judge than production.
    const steps = creditStepSamples(session.track, session.stepSamples ?? []).steps;
    const reward = calculateReward(
      { ...session, steps },
      {
        pointsEarnedToday: mockProfile.pointsEarnedToday,
        multiplier: mockProfile.multiplier,
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
    mockProfile = {
      ...mockProfile,
      pointsBalance: mockProfile.pointsBalance + reward.points,
      pointsEarnedToday: mockProfile.pointsEarnedToday + reward.points,
    };
    // A recorded run costs a credit whatever it earned, which is what "runs
    // left" means. The server does this inside the same transaction that
    // writes the run, so a retried upload cannot spend two.
    mockEntitlement = {
      ...mockEntitlement,
      runsLeft: Math.max(0, mockEntitlement.runsLeft - 1),
      runsThisMonth: mockEntitlement.runsThisMonth + 1,
      stars: mockEntitlement.stars + reward.stars,
      starsToday: mockEntitlement.starsToday + reward.stars,
    };
    return delay(summary, 700);
  },

  async redeemPoints(points) {
    if (points > mockProfile.pointsBalance) throw new Error('Not enough points to redeem.');
    mockProfile = { ...mockProfile, pointsBalance: mockProfile.pointsBalance - points };
    return delay(
      { txHash: `0xmock${Date.now().toString(16).padStart(60, '0')}`, alli: pointsToAlli(points) },
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

  async exchangeStars(stars) {
    const count = Math.floor(stars);
    if (count <= 0) throw new Error('Exchange a whole number of stars.');
    if (count > mockEntitlement.stars) throw new Error('You do not have that many stars.');

    mockEntitlement = { ...mockEntitlement, stars: mockEntitlement.stars - count };
    return delay(
      {
        txHash: `0xmock${Date.now().toString(16).padStart(60, '0')}`,
        alli: starsToAlli(count),
        entitlement: readEntitlement(),
      },
      900,
    );
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
