import { isMock } from '@/config/env';
import { calculateReward, pointsToAlli } from '@/features/jogging/rewards';
import type { JogSession, JogSummary } from '@/features/jogging/types';
import { delay, request } from './client';

export type JoggingProfile = {
  pointsBalance: number;
  pointsEarnedToday: number;
  multiplier: number;
  streakDays: number;
};

export interface JoggingApi {
  getProfile(day: string): Promise<JoggingProfile>;
  getHistory(): Promise<JogSummary[]>;
  /**
   * Uploads the raw track. The server re-runs validation and returns the
   * authoritative reward — the client's own figure is only a preview.
   */
  submitRun(session: JogSession, rejectedPoints: number): Promise<JogSummary>;
  /** Burns points and sends the matching ALLI on-chain. */
  redeemPoints(points: number): Promise<{ txHash: string; alli: number }>;
}

const live: JoggingApi = {
  getProfile: (day) => request(`/v1/jogging/profile?day=${encodeURIComponent(day)}`),
  getHistory: () => request('/v1/jogging/runs'),
  submitRun: (session, rejectedPoints) =>
    request('/v1/jogging/runs', { method: 'POST', body: { session, rejectedPoints } }),
  redeemPoints: (points) =>
    request('/v1/jogging/redeem', { method: 'POST', body: { points } }),
};

let mockProfile: JoggingProfile = {
  pointsBalance: 2_450,
  pointsEarnedToday: 180,
  multiplier: 1.05,
  streakDays: 4,
};
let mockHistory: JogSummary[] = [];

const mock: JoggingApi = {
  getProfile: () => delay({ ...mockProfile }),
  getHistory: () => delay([...mockHistory]),

  async submitRun(session, rejectedPoints) {
    const reward = calculateReward(session, {
      pointsEarnedToday: mockProfile.pointsEarnedToday,
      multiplier: mockProfile.multiplier,
      rejectedPoints,
    });
    const summary: JogSummary = { ...session, reward, confirmed: true };
    mockHistory = [summary, ...mockHistory];
    mockProfile = {
      ...mockProfile,
      pointsBalance: mockProfile.pointsBalance + reward.points,
      pointsEarnedToday: mockProfile.pointsEarnedToday + reward.points,
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
};

export const joggingApi: JoggingApi = isMock ? mock : live;
