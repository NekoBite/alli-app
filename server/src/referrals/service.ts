import { randomInt } from 'node:crypto';

import { pool, transaction, type Db } from '../db/pool.ts';
import { env } from '../config/env.ts';
import { membershipActive } from '../credits/service.ts';
import { ApiError } from '../lib/errors.ts';
import {
  PROGRAM_ORDER,
  REFERRAL_RULES,
  inviteLink,
  makeInviteCode,
  maskEmail,
  splitCommission,
  type DownlineMember,
  type ProgramDetail,
  type ReferralHub,
  type ReferralProgramId,
  type ShoeTier,
  type UplineMember,
} from '../shared/commerce.ts';

type Queryable = Db | typeof pool;
const E18 = 10n ** 18n;
/** How far up a share may roll looking for a qualified member (docs §3: "no depth limit", bounded for safety). */
const MAX_UPLINE = 64;

const toNumber = (raw: string | bigint | null | undefined) => Number(BigInt(raw ?? 0) * 100n / E18) / 100;

/** The member's code for a program, minted on first use. */
export async function codeFor(db: Queryable, userId: string, program: ReferralProgramId): Promise<string> {
  const { rows } = await db.query<{ code: string }>(
    'SELECT code FROM referral_codes WHERE user_id = $1 AND program = $2',
    [userId, program],
  );
  if (rows[0]) return rows[0].code;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = makeInviteCode(REFERRAL_RULES[program].codePrefix, (n) => randomInt(n));
    const { rows: inserted } = await db.query<{ code: string }>(
      `INSERT INTO referral_codes (user_id, program, code) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING RETURNING code`,
      [userId, program, code],
    );
    if (inserted[0]) return inserted[0].code;
    // Either the code collided (retry) or a concurrent request minted ours (read it).
    const { rows: again } = await db.query<{ code: string }>(
      'SELECT code FROM referral_codes WHERE user_id = $1 AND program = $2',
      [userId, program],
    );
    if (again[0]) return again[0].code;
  }
  throw new Error('Could not mint a referral code.');
}

/**
 * Binds `userId` to the owner of `code`, in that code's program only. First join wins: a later link
 * does not move anyone. Self-referral and cycles are refused.
 */
export async function attribute(userId: string, rawCode: string): Promise<{ program: ReferralProgramId }> {
  const code = rawCode.trim().toUpperCase();
  return transaction(async (db) => {
    const { rows } = await db.query<{ user_id: string; program: ReferralProgramId }>(
      'SELECT user_id, program FROM referral_codes WHERE code = $1',
      [code],
    );
    const owner = rows[0];
    if (!owner) throw ApiError.notFound('unknown_code', 'That invite code is not valid.');
    if (owner.user_id === userId) throw ApiError.badRequest('self_referral', 'You cannot use your own invite code.');

    // Serialise attributions in this program so two concurrent ones cannot close a cycle.
    await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sponsorship:${owner.program}`]);
    const upline = await uplineOf(db, owner.user_id, owner.program);
    if (upline.includes(userId)) {
      throw ApiError.badRequest('referral_cycle', 'That invite would put you above yourself.');
    }
    await db.query(
      `INSERT INTO sponsorships (user_id, program, sponsor_id) VALUES ($1, $2, $3)
       ON CONFLICT (user_id, program) DO NOTHING`,
      [userId, owner.program, owner.user_id],
    );
    return { program: owner.program };
  });
}

/** Sponsor chain above `userId` in one program, direct sponsor first. */
export async function uplineOf(db: Queryable, userId: string, program: ReferralProgramId): Promise<string[]> {
  const { rows } = await db.query<{ sponsor_id: string }>(
    `WITH RECURSIVE up AS (
       SELECT sponsor_id, 1 AS depth FROM sponsorships WHERE user_id = $1 AND program = $2
       UNION ALL
       SELECT s.sponsor_id, up.depth + 1 FROM sponsorships s
         JOIN up ON s.user_id = up.sponsor_id AND s.program = $2
        WHERE up.depth < $3
     )
     SELECT sponsor_id FROM up ORDER BY depth`,
    [userId, program, MAX_UPLINE],
  );
  return rows.map((r) => r.sponsor_id);
}

async function shoeTier(db: Queryable, userId: string): Promise<ShoeTier> {
  const { rows } = await db.query<{ shoe_tier: ShoeTier }>('SELECT shoe_tier FROM users WHERE id = $1', [userId]);
  return rows[0]?.shoe_tier ?? 'leather';
}

async function hasGrowingTree(db: Queryable, userId: string, now: number): Promise<boolean> {
  // A tree is growing inside its thirty days and until it dies; `state->>'diedAt'` is set when it does.
  const { rows } = await db.query(
    `SELECT 1 FROM plots
      WHERE user_id = $1 AND planted_at > to_timestamp($2/1000.0) - interval '30 days'
        AND (state->>'diedAt') IS NULL
      LIMIT 1`,
    [userId, now],
  );
  return rows.length > 0;
}

export type Check = { label: string; met: boolean; detail?: string; soft?: boolean };

/** The qualification rule per program (docs/referral-programs.md §2), judged now. */
export async function qualification(db: Queryable, userId: string, program: ReferralProgramId, now = Date.now()): Promise<Check[]> {
  switch (program) {
    case 'run': {
      const tier = await shoeTier(db, userId);
      return [
        { label: 'Silver tier or higher', met: tier === 'silver' || tier === 'gold' },
        { label: 'Membership active', met: await membershipActive(db, userId, now) },
      ];
    }
    case 'garden':
      return [
        { label: 'Own at least one growing tree', met: await hasGrowingTree(db, userId, now) },
        { label: 'Membership active', met: await membershipActive(db, userId, now) },
      ];
    case 'market':
      return [
        { label: 'Any tier — no Silver needed', met: true },
        // Payouts above the threshold wait on KYC; earning does not.
        { label: 'Verify identity for payouts over 100 USDT', met: false, soft: true },
      ];
    case 'card':
      return [];
  }
}

export async function isQualified(db: Queryable, userId: string, program: ReferralProgramId, now = Date.now()): Promise<boolean> {
  if (!REFERRAL_RULES[program].live) return false;
  return (await qualification(db, userId, program, now)).every((c) => c.met || c.soft);
}

/**
 * Books one purchase's commission up the buyer's tree, with the roll-up rule. Idempotent per
 * (intent, generation). Called from payment fulfilment, inside its transaction.
 */
export async function bookCommission(
  db: Db,
  input: {
    program: ReferralProgramId;
    buyerId: string;
    symbol: 'ALLI' | 'USDT';
    amount: bigint;
    intentId: string;
    payableAt?: number;
    now?: number;
  },
): Promise<void> {
  const rules = REFERRAL_RULES[input.program];
  if (!rules.live) return;
  const now = input.now ?? Date.now();
  const ids = await uplineOf(db, input.buyerId, input.program);
  if (ids.length === 0) return;
  const upline: UplineMember[] = [];
  for (const id of ids) upline.push({ id, qualified: await isQualified(db, id, input.program, now) });

  const split = splitCommission(input.amount, rules.ratesBps, upline);
  const rows: { beneficiary: string | null; generation: number; amount: bigint; rolledFrom: string | null }[] =
    split.payouts.map((p) => ({ beneficiary: p.memberId, generation: p.generation, amount: p.amount, rolledFrom: p.rolledUpFrom ?? null }));

  // Treasury shares, per generation, so the ledger accounts for every basis point that left the buyer.
  rules.ratesBps.forEach((bps, i) => {
    const generation = i + 1;
    if (rows.some((r) => r.generation === generation)) return;
    if (!upline[i]) return; // no sponsor at that depth: unassigned, not booked
    const share = (input.amount * BigInt(bps)) / 10_000n;
    if (share > 0n) rows.push({ beneficiary: null, generation, amount: share, rolledFrom: upline[i]!.id });
  });

  for (const r of rows) {
    await db.query(
      `INSERT INTO commissions (program, beneficiary_id, buyer_id, generation, symbol, amount, rolled_up_from, intent_id, payable_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, to_timestamp($9/1000.0))
       ON CONFLICT (intent_id, generation) DO NOTHING`,
      [input.program, r.beneficiary, input.buyerId, r.generation, input.symbol, r.amount.toString(), r.rolledFrom, input.intentId, input.payableAt ?? now],
    );
  }
}

async function earnings(db: Queryable, userId: string, program: ReferralProgramId | null, now: number) {
  const { rows } = await db.query<{ symbol: 'ALLI' | 'USDT'; total: string; released: string; rolled: string }>(
    `SELECT symbol,
            sum(amount)::text AS total,
            coalesce(sum(amount) FILTER (WHERE payable_at <= to_timestamp($3/1000.0)), 0)::text AS released,
            coalesce(sum(amount) FILTER (WHERE rolled_up_from IS NOT NULL), 0)::text AS rolled
       FROM commissions
      WHERE beneficiary_id = $1 AND ($2::text IS NULL OR program = $2)
      GROUP BY symbol`,
    [userId, program, now],
  );
  const by = (s: 'ALLI' | 'USDT', k: 'total' | 'released' | 'rolled') => toNumber(rows.find((r) => r.symbol === s)?.[k]);
  return {
    earned: { usdt: by('USDT', 'total'), alli: by('ALLI', 'total') },
    released: { usdt: by('USDT', 'released'), alli: by('ALLI', 'released') },
    rolledUp: { usdt: by('USDT', 'rolled'), alli: by('ALLI', 'rolled') },
  };
}

async function teamByGeneration(db: Queryable, userId: string, program: ReferralProgramId, depth: number): Promise<number[]> {
  const { rows } = await db.query<{ gen: number; n: string }>(
    `WITH RECURSIVE d AS (
       SELECT user_id, 1 AS gen FROM sponsorships WHERE program = $2 AND sponsor_id = $1
       UNION ALL
       SELECT s.user_id, d.gen + 1 FROM sponsorships s JOIN d ON s.sponsor_id = d.user_id AND s.program = $2
        WHERE d.gen < $3
     )
     SELECT gen, count(*)::text AS n FROM d GROUP BY gen ORDER BY gen`,
    [userId, program, depth],
  );
  return Array.from({ length: depth }, (_, i) => Number(rows.find((r) => r.gen === i + 1)?.n ?? 0));
}

const usd = (e: { usdt: number; alli: number }) => e.usdt + e.alli * env.ALLI_USD_PRICE;

export async function hub(userId: string, now = Date.now()): Promise<ReferralHub> {
  const programs = [];
  for (const program of PROGRAM_ORDER) {
    const code = await codeFor(pool, userId, program);
    const { earned } = await earnings(pool, userId, program, now);
    const team = await teamByGeneration(pool, userId, program, Math.max(1, REFERRAL_RULES[program].ratesBps.length));
    const status = !REFERRAL_RULES[program].live
      ? ('comingSoon' as const)
      : (await isQualified(pool, userId, program, now))
        ? ('earning' as const)
        : ('locked' as const);
    programs.push({ program, code, link: inviteLink(code), status, earned, teamSize: team.reduce((a, b) => a + b, 0) });
  }
  const all = await earnings(pool, userId, null, now);
  return {
    totalEarnedUsdt: round2(usd(all.earned)),
    // "Paid out" = released for payout (past any holding window); claims happen on chain via ReferralPayout.
    paidOutUsdt: round2(usd(all.released)),
    rolledUpUsdt: round2(usd(all.rolledUp)),
    programs,
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export async function programDetail(userId: string, program: ReferralProgramId, now = Date.now()): Promise<ProgramDetail> {
  const rules = REFERRAL_RULES[program];
  const code = await codeFor(pool, userId, program);
  const e = await earnings(pool, userId, program, now);
  const gens = Math.max(1, rules.ratesBps.length);
  const team = await teamByGeneration(pool, userId, program, gens);
  const checks = await qualification(pool, userId, program, now);
  const qualified = rules.live && checks.every((c) => c.met || c.soft);
  const detail: ProgramDetail = {
    program,
    code,
    link: inviteLink(code),
    status: !rules.live ? 'comingSoon' : qualified ? 'earning' : 'locked',
    earned: e.earned,
    teamSize: team.reduce((a, b) => a + b, 0),
    teamByGeneration: team,
    qualification: checks,
    rolledUp: e.rolledUp,
  };
  if (program === 'run') {
    const { rows } = await pool.query<{ n: string }>(
      `SELECT count(*)::text AS n FROM sponsorships s JOIN users u ON u.id = s.user_id
        WHERE s.program = 'run' AND s.sponsor_id = $1 AND u.shoe_tier IN ('silver', 'gold')`,
      [userId],
    );
    detail.milestone = {
      label: 'Path to Gold',
      progress: Math.min(5, Number(rows[0]?.n ?? 0)),
      goal: 5,
      detail: '5 direct referrals upgraded to Silver unlocks Gold.',
    };
  }
  if (program === 'card') {
    const { rows } = await pool.query<{ position: string }>(
      `SELECT count(*)::text AS position FROM referral_codes
        WHERE program = 'card' AND created_at <= (SELECT created_at FROM referral_codes WHERE user_id = $1 AND program = 'card')`,
      [userId],
    );
    detail.waitlist = { friends: team[0] ?? 0, queuePosition: Number(rows[0]?.position ?? 0) };
  }
  return detail;
}

/** The downline for the tree views (6.6 / 6.6b): masked handles, tiers, who rolls up. */
export async function downline(userId: string, program: ReferralProgramId, now = Date.now()) {
  const depth = Math.max(1, REFERRAL_RULES[program].ratesBps.length);
  const { rows } = await pool.query<{
    user_id: string;
    sponsor_id: string;
    gen: number;
    email: string | null;
    display_name: string | null;
    shoe_tier: ShoeTier;
    joined: Date;
  }>(
    `WITH RECURSIVE d AS (
       SELECT user_id, sponsor_id, created_at, 1 AS gen FROM sponsorships WHERE program = $2 AND sponsor_id = $1
       UNION ALL
       SELECT s.user_id, s.sponsor_id, s.created_at, d.gen + 1 FROM sponsorships s
         JOIN d ON s.sponsor_id = d.user_id AND s.program = $2
        WHERE d.gen < $3
     )
     SELECT d.user_id, d.sponsor_id, d.gen, u.email, u.display_name, u.shoe_tier, d.created_at AS joined
       FROM d JOIN users u ON u.id = d.user_id
      ORDER BY d.gen, d.created_at
      LIMIT 500`,
    [userId, program, depth],
  );
  const members: DownlineMember[] = [];
  for (const r of rows) {
    const qualified = await isQualified(pool, r.user_id, program, now);
    const joined = r.joined.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    members.push({
      id: r.user_id,
      handle: r.email ? maskEmail(r.email) : maskEmail(r.display_name ?? 'member'),
      generation: r.gen,
      sponsorId: r.gen === 1 ? null : r.sponsor_id,
      tier: r.shoe_tier,
      qualified,
      note: qualified ? `joined ${joined}` : 'not qualified · rolls up',
    });
  }
  const total = (await teamByGeneration(pool, userId, program, depth)).reduce((a, b) => a + b, 0);
  return { program, total, members };
}
