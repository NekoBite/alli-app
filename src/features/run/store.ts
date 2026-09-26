import { create } from 'zustand';

import { runApi } from '@/services/api';
import { dayKey } from '@/utils/time';
import { checkCanStart, checkPurchase, RUN_CREDIT_RULES, type PayCurrency } from './credits';
import { calculateReward } from './rewards';
import { DEFAULT_SHOE_TIER } from './shoes';
import type { RewardBreakdown, RunEntitlement, RunSession, RunSummary } from './types';
import type { RunProfile } from '@/services/api';

/**
 * What the app assumes before the server has answered: nothing earned, nothing
 * banked today, the free tier. Optimistic defaults would show a quest half
 * finished that the server then denies.
 */
const EMPTY_PROFILE: RunProfile = {
  starsBalance: 0,
  starsEarnedToday: 0,
  stepsToday: 0,
  streakDays: 0,
  shoeTier: DEFAULT_SHOE_TIER,
};

/** Likewise: no credits until the server says otherwise. */
const EMPTY_ENTITLEMENT: RunEntitlement = {
  runsLeft: 0,
  runsThisMonth: 0,
  extraRunsBoughtThisMonth: 0,
  membership: {
    status: 'none',
    runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
    priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
  },
  serverTime: 0,
};

type RunState = {
  history: RunSummary[];
  /** Stars, today's quest progress and the shoe tier. */
  profile: RunProfile;
  /** Run credits and membership, as the server counts them. */
  entitlement: RunEntitlement;
  /**
   * Set when the entitlement could not be read. The quest half of the screen
   * still works; only the credit surfaces go quiet.
   */
  entitlementError?: string;
  loading: boolean;
  exchanging: boolean;
  buying: boolean;
  renewing: boolean;
  error?: string;

  refresh: () => Promise<void>;
  /** Local preview of what a finished run adds to today's quest. */
  previewReward: (
    session: Pick<RunSession, 'distanceMetres' | 'movingSeconds' | 'track' | 'steps'>,
    rejectedPoints: number,
  ) => RewardBreakdown;
  submitRun: (session: RunSession, rejectedPoints: number) => Promise<RunSummary>;
  /** Burns stars and sends the matching ALLI to the user's wallet. */
  exchangeStars: (stars: number, toAddress: string) => Promise<{ txHash: string; alli: number }>;
  /** Buys extra run credits, paid in ALLI or USDT. */
  buyRuns: (count: number, currency: PayCurrency) => Promise<void>;
  renewMembership: (currency: PayCurrency) => Promise<void>;
  /** Whether a run may be started — credits, in a form the button can explain. */
  canStart: () => { ok: boolean; reason?: string };
};

export const useRunStore = create<RunState>((set, get) => ({
  history: [],
  profile: EMPTY_PROFILE,
  entitlement: EMPTY_ENTITLEMENT,
  loading: false,
  exchanging: false,
  buying: false,
  renewing: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      const [profile, history] = await Promise.all([
        runApi.getProfile(dayKey()),
        runApi.getHistory(),
      ]);
      set({ profile, history, loading: false });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }

    // Read separately, and non-fatally: run credits are not implemented by the
    // backend yet, and a 404 there must not blank the stars the user does have.
    try {
      set({ entitlement: await runApi.getEntitlement(), entitlementError: undefined });
    } catch (error) {
      set({ entitlementError: (error as Error).message });
    }
  },

  previewReward(session, rejectedPoints) {
    const { profile } = get();
    return calculateReward(session, {
      stepsToday: profile.stepsToday,
      starsEarnedToday: profile.starsEarnedToday,
      shoeTier: profile.shoeTier,
      rejectedPoints,
    });
  },

  async submitRun(session, rejectedPoints) {
    set({ error: undefined });
    // The server re-runs validation on the raw track; its numbers win.
    const summary = await runApi.submitRun(session, rejectedPoints);
    set((state) => ({
      history: [summary, ...state.history],
      profile: {
        ...state.profile,
        starsBalance: state.profile.starsBalance + summary.reward.stars,
        starsEarnedToday: state.profile.starsEarnedToday + summary.reward.stars,
        stepsToday: summary.reward.stepsToday,
      },
    }));
    // The credit was spent server-side, so the balance is re-read rather than
    // guessed at here.
    try {
      set({ entitlement: await runApi.getEntitlement(), entitlementError: undefined });
    } catch (error) {
      set({ entitlementError: (error as Error).message });
    }
    return summary;
  },

  async exchangeStars(stars, toAddress) {
    set({ exchanging: true, error: undefined });
    try {
      const result = await runApi.exchangeStars(stars, toAddress);
      set((state) => ({
        profile: { ...state.profile, starsBalance: result.starsBalance },
        exchanging: false,
      }));
      return { txHash: result.txHash, alli: result.alli };
    } catch (error) {
      set({ exchanging: false, error: (error as Error).message });
      throw error;
    }
  },

  async buyRuns(count, currency) {
    const check = checkPurchase(count, get().entitlement);
    if (!check.ok) throw new Error(check.reason);

    set({ buying: true, error: undefined });
    try {
      set({ entitlement: await runApi.buyRuns(count, currency), buying: false, entitlementError: undefined });
    } catch (error) {
      set({ buying: false, error: (error as Error).message });
      throw error;
    }
  },

  async renewMembership(currency) {
    set({ renewing: true, error: undefined });
    try {
      set({
        entitlement: await runApi.renewMembership(currency),
        renewing: false,
        entitlementError: undefined,
      });
    } catch (error) {
      set({ renewing: false, error: (error as Error).message });
      throw error;
    }
  },

  canStart() {
    const { entitlement, entitlementError } = get();
    // Unknown is not the same as empty: if the credit balance could not be
    // read, let the run start and let the server be the one to refuse it.
    if (entitlementError) return { ok: true };
    return checkCanStart(entitlement);
  },
}));
