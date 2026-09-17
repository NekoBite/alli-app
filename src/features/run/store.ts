import { create } from 'zustand';

import { runApi } from '@/services/api';
import { dayKey } from '@/utils/time';
import { checkCanStart, checkPurchase, RUN_CREDIT_RULES } from './credits';
import { calculateReward } from './rewards';
import type { RewardBreakdown, RunEntitlement, RunSession, RunSummary } from './types';

/**
 * What the app assumes before the server has answered: no credits, no stars, no
 * membership. Optimistic defaults would show a Start button that the server
 * then refuses, so the pessimistic ones are the honest choice.
 */
const EMPTY_ENTITLEMENT: RunEntitlement = {
  runsLeft: 0,
  runsThisMonth: 0,
  extraRunsBoughtThisMonth: 0,
  stars: 0,
  starsToday: 0,
  membership: {
    status: 'none',
    runsPerRenewal: RUN_CREDIT_RULES.runsPerRenewal,
    priceUsdt: RUN_CREDIT_RULES.membershipPriceUsdt,
  },
  serverTime: 0,
};

type RunState = {
  history: RunSummary[];
  /** Points held off-chain, redeemable for ALLI. */
  pointsBalance: number;
  pointsEarnedToday: number;
  /** Server-issued bonus multiplier (streaks, planted trees, events). */
  multiplier: number;
  /** Consecutive days with a qualifying run. */
  streakDays: number;
  /** Run credits, stars and membership, as the server counts them. */
  entitlement: RunEntitlement;
  /**
   * Set when the entitlement could not be read. The rest of the screen still
   * works on points; only the credit and star surfaces go quiet.
   */
  entitlementError?: string;
  loading: boolean;
  redeeming: boolean;
  buying: boolean;
  exchanging: boolean;
  renewing: boolean;
  error?: string;

  refresh: () => Promise<void>;
  /** Local preview of what a finished run is worth, before the server validates. */
  previewReward: (
    session: Pick<RunSession, 'distanceMetres' | 'movingSeconds' | 'track' | 'steps'>,
    rejectedPoints: number,
  ) => RewardBreakdown;
  submitRun: (session: RunSession, rejectedPoints: number) => Promise<RunSummary>;
  /** Burns points and mints the matching ALLI to the user's wallet. */
  redeemPoints: (points: number, toAddress: string) => Promise<{ txHash: string; alli: number }>;
  /** Buys extra run credits. The USDT charge is the server's to make. */
  buyRuns: (count: number) => Promise<void>;
  /** Exchanges stars for ALLI on-chain. */
  exchangeStars: (stars: number, toAddress: string) => Promise<{ txHash: string; alli: number }>;
  renewMembership: () => Promise<void>;
  /** Whether a run may be started — credits, in a form the button can explain. */
  canStart: () => { ok: boolean; reason?: string };
};

export const useRunStore = create<RunState>((set, get) => ({
  history: [],
  pointsBalance: 0,
  pointsEarnedToday: 0,
  multiplier: 1,
  streakDays: 0,
  entitlement: EMPTY_ENTITLEMENT,
  loading: false,
  redeeming: false,
  buying: false,
  exchanging: false,
  renewing: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      const [profile, history] = await Promise.all([
        runApi.getProfile(dayKey()),
        runApi.getHistory(),
      ]);
      set({
        pointsBalance: profile.pointsBalance,
        pointsEarnedToday: profile.pointsEarnedToday,
        multiplier: profile.multiplier,
        streakDays: profile.streakDays,
        history,
        loading: false,
      });
    } catch (error) {
      set({ loading: false, error: (error as Error).message });
    }

    // Read separately, and non-fatally: run credits are not implemented by the
    // backend yet, and a 404 there must not blank the points the user does have.
    try {
      set({ entitlement: await runApi.getEntitlement(), entitlementError: undefined });
    } catch (error) {
      set({ entitlementError: (error as Error).message });
    }
  },

  previewReward(session, rejectedPoints) {
    const { pointsEarnedToday, multiplier } = get();
    return calculateReward(session, { pointsEarnedToday, multiplier, rejectedPoints });
  },

  async submitRun(session, rejectedPoints) {
    set({ error: undefined });
    // The server re-runs validation on the raw track; its numbers win.
    const summary = await runApi.submitRun(session, rejectedPoints);
    set((state) => ({
      history: [summary, ...state.history],
      pointsBalance: state.pointsBalance + summary.reward.points,
      pointsEarnedToday: state.pointsEarnedToday + summary.reward.points,
    }));
    // The credit was spent and the star awarded server-side, so the balances
    // are re-read rather than guessed at here.
    try {
      set({ entitlement: await runApi.getEntitlement(), entitlementError: undefined });
    } catch (error) {
      set({ entitlementError: (error as Error).message });
    }
    return summary;
  },

  async redeemPoints(points, toAddress) {
    set({ redeeming: true, error: undefined });
    try {
      const result = await runApi.redeemPoints(points, toAddress);
      set((state) => ({
        pointsBalance: state.pointsBalance - points,
        redeeming: false,
      }));
      return result;
    } catch (error) {
      set({ redeeming: false, error: (error as Error).message });
      throw error;
    }
  },

  async buyRuns(count) {
    const check = checkPurchase(count, get().entitlement);
    if (!check.ok) throw new Error(check.reason);

    set({ buying: true, error: undefined });
    try {
      set({ entitlement: await runApi.buyRuns(count), buying: false, entitlementError: undefined });
    } catch (error) {
      set({ buying: false, error: (error as Error).message });
      throw error;
    }
  },

  async exchangeStars(stars, toAddress) {
    set({ exchanging: true, error: undefined });
    try {
      const result = await runApi.exchangeStars(stars, toAddress);
      set({ entitlement: result.entitlement, exchanging: false, entitlementError: undefined });
      return { txHash: result.txHash, alli: result.alli };
    } catch (error) {
      set({ exchanging: false, error: (error as Error).message });
      throw error;
    }
  },

  async renewMembership() {
    set({ renewing: true, error: undefined });
    try {
      set({
        entitlement: await runApi.renewMembership(),
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
