import type { PayoutCurrency, ReferralProgramId } from './types';

/**
 * Referral program rules, and the commission split with roll-up.
 *
 * Pure and shared with the server (server/src/shared/referrals.ts), which is the only place a
 * commission is booked. Rates are basis points so the split stays exact in integer units; amounts
 * are bigint in the token's smallest unit (18-decimal USDT and ALLI on BSC).
 *
 * Rates for Garden, Market and Card are proposals the back office will own as configuration; they
 * are here so the app can show them and the server has a default.
 */
export type ProgramRules = {
  program: ReferralProgramId;
  /** Invite code prefix: RUN-, GRD-, MKT-, CRD-. */
  codePrefix: string;
  title: string;
  /** What pays, in plain words. */
  trigger: string;
  /** Paid generations, Gen 1 first, in basis points of the commissionable amount. */
  ratesBps: readonly number[];
  /** `seed` = paid in the currency the seed was bought in. */
  currency: PayoutCurrency | 'seed' | 'order';
  /** Card starts as a waitlist. */
  live: boolean;
};

export const REFERRAL_RULES: Record<ReferralProgramId, ProgramRules> = {
  run: {
    program: 'run',
    codePrefix: 'RUN',
    title: 'ALLI RUN',
    trigger:
      "Paid when someone in your Run team upgrades their shoe to Silver: 40% to Gen 1, 10% each to Gen 2–4.",
    ratesBps: [4000, 1000, 1000, 1000],
    currency: 'USDT',
    live: true,
  },
  garden: {
    program: 'garden',
    codePrefix: 'GRD',
    title: 'Garden',
    trigger:
      'Paid when someone in your Garden team buys seeds. ALLI seeds pay in ALLI; Premium (USDT) seeds pay in USDT.',
    ratesBps: [2000, 500, 500],
    currency: 'seed',
    live: true,
  },
  market: {
    program: 'market',
    codePrefix: 'MKT',
    title: 'Marketplace',
    trigger:
      'Paid on every completed order your Market team places, from the platform fee. Shared product links count too.',
    ratesBps: [100, 50],
    currency: 'order',
    live: true,
  },
  card: {
    program: 'card',
    codePrefix: 'CRD',
    title: 'ALLI Card',
    trigger:
      'Proposed: 5 USDT when a friend activates their card, plus 0.2% of their card spend (Gen 1 only). Final rates at launch.',
    ratesBps: [20],
    currency: 'USDT',
    live: false,
  },
};

export const PROGRAM_ORDER: ReferralProgramId[] = ['run', 'garden', 'market', 'card'];

/** "40% / 10%", "1% / 0.5%": Gen 1 then the deeper rate(s), as the hub prints them. */
export function formatRates(ratesBps: readonly number[]): string {
  const pct = (bps: number) => `${(bps / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
  const [first, ...rest] = ratesBps;
  if (first === undefined) return '—';
  const deeper = [...new Set(rest)];
  return [pct(first), ...deeper.map(pct)].join(' / ');
}

export function inviteLink(code: string): string {
  return `alli.app/r/${code}`;
}

/** An upline member as the split sees them: who they are and whether they qualify right now. */
export type UplineMember = { id: string; qualified: boolean };

export type CommissionPayout = {
  memberId: string;
  /** The generation whose share this is (1 = the buyer's direct sponsor). */
  generation: number;
  amount: bigint;
  /** Set when the share rolled up from an unqualified member at that generation. */
  rolledUpFrom?: string;
};

export type CommissionSplit = {
  payouts: CommissionPayout[];
  /** Unqualified Gen 1 shares, and roll-ups that found nobody qualified above. */
  treasury: bigint;
  /** Shares with no sponsor at that depth: never paid, stay with the project. */
  unassigned: bigint;
};

/**
 * Splits one commissionable amount up the buyer's sponsor chain.
 *
 * `upline` is the chain above the buyer, direct sponsor first, as deep as the tree goes (deeper
 * than the paid generations, because a share can roll past them). Qualification is judged by the
 * caller at payout time.
 *
 * The rule (docs/referral-programs.md §3): generation g's share goes to the g-th sponsor if they
 * qualify. An unqualified Gen 1 sponsor's share goes to the treasury. An unqualified deeper
 * sponsor's share rolls up to the nearest qualified member above them, with no depth limit; if
 * there is none it goes to the treasury.
 */
export function splitCommission(
  amount: bigint,
  ratesBps: readonly number[],
  upline: readonly UplineMember[],
): CommissionSplit {
  if (amount < 0n) throw new Error('Commission base cannot be negative.');
  const payouts: CommissionPayout[] = [];
  let treasury = 0n;
  let unassigned = 0n;

  ratesBps.forEach((bps, index) => {
    const generation = index + 1;
    const share = (amount * BigInt(bps)) / 10_000n;
    if (share === 0n) return;
    const member = upline[index];
    if (!member) {
      unassigned += share;
      return;
    }
    if (member.qualified) {
      payouts.push({ memberId: member.id, generation, amount: share });
      return;
    }
    if (generation === 1) {
      treasury += share;
      return;
    }
    const receiver = upline.slice(index + 1).find((m) => m.qualified);
    if (receiver) {
      payouts.push({ memberId: receiver.id, generation, amount: share, rolledUpFrom: member.id });
    } else {
      treasury += share;
    }
  });

  return { payouts, treasury, unassigned };
}

/** Total paid to one member by a split: their own share plus anything that rolled up to them. */
export function paidTo(split: CommissionSplit, memberId: string): bigint {
  return split.payouts.filter((p) => p.memberId === memberId).reduce((sum, p) => sum + p.amount, 0n);
}

/**
 * A new code for a program: prefix + six characters from an alphabet without look-alikes
 * (no 0/O, 1/I/L). `random` returns an integer in [0, n); the server passes a CSPRNG.
 */
export function makeInviteCode(prefix: string, random: (n: number) => number): string {
  const alphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let body = '';
  for (let i = 0; i < 6; i += 1) body += alphabet[random(alphabet.length)];
  return `${prefix}-${body}`;
}

/** Masks an e-mail for a downline list: two characters, stars, and the domain. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(3, user.length - 2))}${domain ? `@${domain}` : ''}`;
}
