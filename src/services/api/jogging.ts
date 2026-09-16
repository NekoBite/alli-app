import { isMock } from '@/config/env';
import { calculateReward, pointsToAlli } from '@/features/jogging/rewards';
import type { JogSession, JogSummary } from '@/features/jogging/types';
import { dayKey } from '@/utils/time';
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
  /**
   * Burns points and sends the matching ALLI on-chain.
   *
   * `toAddress` is explicit rather than looked up server-side: the backend
   * stores a wallet address per account, but paying out to a stale one because
   * the device changed wallets is not a mistake you can take back.
   */
  redeemPoints(points: number, toAddress: string): Promise<{ txHash: string; alli: number }>;
}

const live: JoggingApi = {
  getProfile: (day) => request(`/v1/jogging/profile?day=${encodeURIComponent(day)}`),
  getHistory: () => request('/v1/jogging/runs'),

  /**
   * Sends the raw track and nothing else that matters.
   *
   * Note what is deliberately NOT in this body: distance, moving time, and the
   * rejected-fix count. The server recomputes all three from `track` with the
   * same functions that produced the on-screen preview, so there is nowhere for
   * a modified client to put a better number. `rejectedPoints` stays in the
   * signature only because the mock needs it to reproduce the preview offline.
   */
  submitRun: (session) =>
    request('/v1/jogging/runs', {
      method: 'POST',
      body: {
        clientRunId: session.id,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        track: session.track,
        steps: session.steps,
        // The runner's local day, so the daily cap resets at their midnight.
        day: dayKey(new Date(session.startedAt)),
      },
    }),

  redeemPoints: (points, toAddress) =>
    request('/v1/jogging/redeem', {
      method: 'POST',
      body: { points, toAddress, day: dayKey() },
    }),
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
