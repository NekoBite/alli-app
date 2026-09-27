import type { ShoeTier } from '../run/shoes';

/**
 * Referral programs — one per feature, each with its own code, team and ledger.
 * See docs/referral-programs.md for the product rules and the wireframes' section 06.
 */
export type ReferralProgramId = 'run' | 'garden' | 'market' | 'card';

/** `locked`: the member earns nothing right now because they fail the qualification check. */
export type ProgramStatus = 'earning' | 'locked' | 'comingSoon';

export type PayoutCurrency = 'USDT' | 'ALLI';

/** Money a program paid or holds, split by the currency it was paid in. */
export type Earnings = { usdt: number; alli: number };

export type QualificationCheck = {
  label: string;
  met: boolean;
  /** "until 3 Oct", "KYC above 100 USDT". */
  detail?: string;
  /** Amber, not failed: a check that only matters above a threshold. */
  soft?: boolean;
};

export type ProgramSummary = {
  program: ReferralProgramId;
  /** RUN-7KQ2XA, GRD-3M9PLE… */
  code: string;
  /** alli.app/r/<code> */
  link: string;
  status: ProgramStatus;
  earned: Earnings;
  teamSize: number;
};

export type ReferralHub = {
  /** Everything earned across programs, valued in USDT at the published ALLI rate. */
  totalEarnedUsdt: number;
  paidOutUsdt: number;
  /** Shares passed up to this member from unqualified members below them. */
  rolledUpUsdt: number;
  programs: ProgramSummary[];
};

export type ProgramDetail = ProgramSummary & {
  /** Team members per paid generation, Gen 1 first. */
  teamByGeneration: number[];
  qualification: QualificationCheck[];
  /** Commission that rolled up to this member in this program. */
  rolledUp: Earnings;
  /** Card only, until launch. */
  waitlist?: { friends: number; queuePosition: number };
  /** ALLI RUN: direct referrals upgraded to Silver, towards the Gold unlock. */
  milestone?: { label: string; progress: number; goal: number; detail: string };
};

export type DownlineMember = {
  id: string;
  /** Masked e-mail or handle: "je******@gmail.com". Never the full address. */
  handle: string;
  generation: number;
  /** Null for Gen 1: their sponsor is the viewer. */
  sponsorId: string | null;
  tier: ShoeTier;
  qualified: boolean;
  /** "upgraded Sep 2", "joined Sep 24". */
  note: string;
};

export type Downline = {
  program: ReferralProgramId;
  total: number;
  members: DownlineMember[];
};
