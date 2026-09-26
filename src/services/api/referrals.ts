import { isMock } from '@/config/env';
import { inviteLink, REFERRAL_RULES } from '@/features/referrals/rules';
import type {
  Downline,
  DownlineMember,
  ProgramDetail,
  ReferralHub,
  ReferralProgramId,
} from '@/features/referrals/types';
import { delay, request } from './client';

/**
 * Referral programs (wireframes section 06). The server owns every number here: codes are minted
 * server-side, attribution happens at sign-up, and commissions are booked when the triggering
 * purchase is confirmed on chain (see docs/referral-programs.md).
 */
export interface ReferralApi {
  getHub(): Promise<ReferralHub>;
  getProgram(program: ReferralProgramId): Promise<ProgramDetail>;
  getDownline(program: ReferralProgramId): Promise<Downline>;
  /** Binds the signed-in member to the sponsor behind `code`, in that code's program only. */
  attribute(code: string): Promise<{ program: ReferralProgramId }>;
}

const live: ReferralApi = {
  getHub: () => request('/v1/referrals'),
  getProgram: (program) => request(`/v1/referrals/${program}`),
  getDownline: (program) => request(`/v1/referrals/${program}/downline`),
  attribute: (code) => request('/v1/referrals/attribute', { method: 'POST', body: { code } }),
};

const CODES: Record<ReferralProgramId, string> = {
  run: 'RUN-7KQ2XA',
  garden: 'GRD-3M9PLE',
  market: 'MKT-P4W8ZN',
  card: 'CRD-9TQ4HB',
};

const summary = (program: ReferralProgramId) => ({
  program,
  code: CODES[program],
  link: inviteLink(CODES[program]),
});

const MOCK_DETAIL: Record<ReferralProgramId, ProgramDetail> = {
  run: {
    ...summary('run'),
    status: 'earning',
    earned: { usdt: 842.17, alli: 0 },
    teamSize: 255,
    teamByGeneration: [5, 38, 94, 118],
    qualification: [
      { label: 'Silver tier or higher', met: true },
      { label: 'Membership active', met: true, detail: 'until 3 Oct' },
    ],
    rolledUp: { usdt: 58.4, alli: 0 },
    milestone: {
      label: 'Path to Gold',
      progress: 3,
      goal: 5,
      detail: '5 direct referrals upgraded to Silver unlocks Gold.',
    },
  },
  garden: {
    ...summary('garden'),
    status: 'earning',
    earned: { usdt: 128.4, alli: 1240 },
    teamSize: 42,
    teamByGeneration: [9, 14, 19],
    qualification: [
      { label: 'Own at least one growing tree', met: true },
      { label: 'Membership active', met: true },
    ],
    rolledUp: { usdt: 11.9, alli: 0 },
  },
  market: {
    ...summary('market'),
    status: 'earning',
    earned: { usdt: 36.9, alli: 0 },
    teamSize: 17,
    teamByGeneration: [6, 11],
    qualification: [
      { label: 'Any tier — no Silver needed', met: true },
      { label: 'Verify identity for payouts over 100 USDT', met: false, soft: true },
    ],
    rolledUp: { usdt: 4.3, alli: 0 },
  },
  card: {
    ...summary('card'),
    status: 'comingSoon',
    earned: { usdt: 0, alli: 0 },
    teamSize: 12,
    teamByGeneration: [12],
    qualification: [],
    rolledUp: { usdt: 0, alli: 0 },
    waitlist: { friends: 12, queuePosition: 1204 },
  },
};

const RUN_DOWNLINE: DownlineMember[] = [
  { id: 'm1', handle: 'je******@gmail.com', generation: 1, sponsorId: null, tier: 'silver', qualified: true, note: 'upgraded Sep 2' },
  { id: 'm2', handle: 'pa******@hotmail.com', generation: 2, sponsorId: 'm1', tier: 'leather', qualified: false, note: 'not qualified · rolls up' },
  { id: 'm3', handle: 'ki******@gmail.com', generation: 3, sponsorId: 'm2', tier: 'silver', qualified: true, note: 'upgraded Sep 12' },
  { id: 'm4', handle: 'su******@gmail.com', generation: 1, sponsorId: null, tier: 'gold', qualified: true, note: '5/5 directs' },
  { id: 'm5', handle: 'ar******@gmail.com', generation: 2, sponsorId: 'm4', tier: 'silver', qualified: true, note: 'upgraded Aug 28' },
  { id: 'm6', handle: 'to******@gmail.com', generation: 3, sponsorId: 'm5', tier: 'silver', qualified: true, note: 'upgraded Sep 20' },
  { id: 'm7', handle: 'mi******@gmail.com', generation: 4, sponsorId: 'm6', tier: 'leather', qualified: false, note: 'joined Sep 24' },
];

const mock: ReferralApi = {
  getHub: () =>
    delay<ReferralHub>({
      totalEarnedUsdt: 1007.47,
      paidOutUsdt: 912.4,
      rolledUpUsdt: 74.6,
      programs: (['run', 'garden', 'market', 'card'] as const).map((p) => {
        const { program, code, link, status, earned, teamSize } = MOCK_DETAIL[p];
        return { program, code, link, status, earned, teamSize };
      }),
    }),
  getProgram: (program) => delay({ ...MOCK_DETAIL[program] }),
  getDownline: (program) =>
    delay<Downline>({
      program,
      total: MOCK_DETAIL[program].teamSize,
      members: program === 'run' ? RUN_DOWNLINE : RUN_DOWNLINE.slice(0, program === 'card' ? 0 : 4),
    }),
  async attribute(code) {
    const prefix = code.split('-')[0]?.toUpperCase();
    const hit = Object.values(REFERRAL_RULES).find((r) => r.codePrefix === prefix);
    if (!hit) throw new Error('That invite code is not valid.');
    return delay({ program: hit.program });
  },
};

export const referralApi: ReferralApi = isMock ? mock : live;
