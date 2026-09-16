import { create } from 'zustand';

import { joggingApi } from '@/services/api';
import { dayKey } from '@/utils/time';
import { calculateReward } from './rewards';
import type { JogSession, JogSummary, RewardBreakdown } from './types';

type JoggingState = {
  history: JogSummary[];
  /** Points held off-chain, redeemable for ALLI. */
  pointsBalance: number;
  pointsEarnedToday: number;
  /** Server-issued bonus multiplier (streaks, planted trees, events). */
  multiplier: number;
  /** Consecutive days with a qualifying run. */
  streakDays: number;
  loading: boolean;
  redeeming: boolean;
  error?: string;

  refresh: () => Promise<void>;
  /** Local preview of what a finished run is worth, before the server validates. */
  previewReward: (
    session: Pick<JogSession, 'distanceMetres' | 'movingSeconds' | 'track' | 'steps'>,
    rejectedPoints: number,
  ) => RewardBreakdown;
  submitRun: (session: JogSession, rejectedPoints: number) => Promise<JogSummary>;
  /** Burns points and mints the matching ALLI to the user's wallet. */
  redeemPoints: (points: number, toAddress: string) => Promise<{ txHash: string; alli: number }>;
};

export const useJoggingStore = create<JoggingState>((set, get) => ({
  history: [],
  pointsBalance: 0,
  pointsEarnedToday: 0,
  multiplier: 1,
  streakDays: 0,
  loading: false,
  redeeming: false,

  async refresh() {
    set({ loading: true, error: undefined });
    try {
      const [profile, history] = await Promise.all([
        joggingApi.getProfile(dayKey()),
        joggingApi.getHistory(),
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
  },

  previewReward(session, rejectedPoints) {
    const { pointsEarnedToday, multiplier } = get();
    return calculateReward(session, { pointsEarnedToday, multiplier, rejectedPoints });
  },

  async submitRun(session, rejectedPoints) {
    set({ error: undefined });
    // The server re-runs validation on the raw track; its numbers win.
    const summary = await joggingApi.submitRun(session, rejectedPoints);
    set((state) => ({
      history: [summary, ...state.history],
      pointsBalance: state.pointsBalance + summary.reward.points,
      pointsEarnedToday: state.pointsEarnedToday + summary.reward.points,
    }));
    return summary;
  },

  async redeemPoints(points, toAddress) {
    set({ redeeming: true, error: undefined });
    try {
      const result = await joggingApi.redeemPoints(points, toAddress);
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
}));
