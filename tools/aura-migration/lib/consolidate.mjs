// Turns a raw capture folder into the files the migration needs.
//
// Re-runnable without a browser: the per-member files keep the page's raw text, and this module
// re-parses it every time, so a parser fix applies to a capture that is already on disk.
//
//   private/    real emails, wallets and balances. For the operator only. Never commit.
//   shareable/  the same figures with every email replaced by a stable alias and no wallets or
//               internal ids, so the shape of the data can be reviewed without the people in it.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { completeWallet } from './ids.mjs';
import { parseAmount, parseMemberDetail } from './parse.mjs';

const EMAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const toCsv = (header, rows) => [header.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\n') + '\n';
const round = (n) => (n === null || n === undefined ? null : Math.round(n * 1e6) / 1e6);

/** Distinct (generation, percent, amount) combinations and where the rate changed. */
export function rateTimeline(commissions) {
  const groups = new Map();
  for (const c of commissions) {
    if (!c.at || c.generation == null) continue;
    const key = `${c.generation}|${c.percent}|${c.amount}`;
    const g = groups.get(key) ?? { generation: c.generation, percent: c.percent, amount: c.amount, count: 0, firstAt: c.at, lastAt: c.at };
    g.count += 1;
    if (c.at < g.firstAt) g.firstAt = c.at;
    if (c.at > g.lastAt) g.lastAt = c.at;
    groups.set(key, g);
  }
  const combinations = [...groups.values()].sort((a, b) => a.generation - b.generation || a.firstAt.localeCompare(b.firstAt));

  const changes = [];
  const byGen = new Map();
  for (const c of commissions) {
    if (!c.at || c.generation == null) continue;
    byGen.set(c.generation, [...(byGen.get(c.generation) ?? []), c]);
  }
  for (const [generation, rows] of byGen) {
    rows.sort((a, b) => a.at.localeCompare(b.at));
    for (let i = 1; i < rows.length; i += 1) {
      if (rows[i].percent !== rows[i - 1].percent) {
        changes.push({
          generation,
          from: rows[i - 1].percent,
          to: rows[i].percent,
          lastRowAtOldRate: rows[i - 1].at,
          firstRowAtNewRate: rows[i].at,
        });
      }
    }
  }
  changes.sort((a, b) => a.generation - b.generation || a.firstRowAtNewRate.localeCompare(b.firstRowAtNewRate));
  return { combinations, changes };
}

/**
 * @param {{ members: object[], commissions: object[], details: object[], dashboard?: object|null,
 *           meta?: object }} input
 *   `details` are the per-member capture files: { id, tokens, api }.
 */
export function buildOutputs({ members, commissions, details, dashboard = null, meta = {} }) {
  const parsed = [];
  for (const d of details) {
    const p = parseMemberDetail(d.tokens ?? []);
    if (!p.ok) {
      parsed.push({ id: d.id, ok: false, warnings: p.warnings });
      continue;
    }
    p.id = p.id ?? d.id;
    if (p.walletTruncated) {
      const full = completeWallet(p.wallet, (d.api ?? []).map((a) => a.json).filter(Boolean));
      if (full) {
        p.wallet = full;
        p.walletTruncated = false;
        p.walletFrom = 'api';
      }
    }
    parsed.push(p);
  }
  const detailByEmail = new Map(parsed.filter((p) => p.ok && p.email).map((p) => [p.email, p]));
  const detailById = new Map(parsed.filter((p) => p.ok && p.id).map((p) => [p.id, p]));

  // One merged row per member: the list row (the table's figures) plus the profile.
  const listByEmail = new Map(members.map((m) => [String(m.email).toLowerCase(), m]));
  const emails = new Set([...listByEmail.keys(), ...detailByEmail.keys()]);
  const merged = [...emails].sort().map((email) => {
    const row = listByEmail.get(email) ?? {};
    const d = detailByEmail.get(email) ?? (row.id ? detailById.get(row.id) : undefined) ?? null;
    return { email, id: row.id ?? d?.id ?? null, list: row, detail: d };
  });

  // Ledger totals per beneficiary, to cross-check each profile's "Referral earned".
  const ledgerTotals = new Map();
  for (const c of commissions) {
    if (c.status && c.status !== 'CREDITED') continue;
    const t = ledgerTotals.get(c.beneficiary) ?? { amount: 0, count: 0 };
    t.amount += c.amount ?? 0;
    t.count += 1;
    ledgerTotals.set(c.beneficiary, t);
  }

  const earnedMismatches = [];
  for (const m of merged) {
    const earned = m.detail?.referralEarned;
    if (!earned || earned.amount == null) continue;
    const ledger = ledgerTotals.get(m.email) ?? { amount: 0, count: 0 };
    if (Math.abs(ledger.amount - earned.amount) > 0.011 || (earned.commissionCount != null && ledger.count !== earned.commissionCount)) {
      earnedMismatches.push({
        email: m.email,
        profile: { amount: earned.amount, count: earned.commissionCount },
        ledger: { amount: round(ledger.amount), count: ledger.count },
      });
    }
  }

  // Sponsorship edges, and whether each profile's referral list agrees with its referrals' own.
  const edges = merged
    .filter((m) => m.detail?.referredBy)
    .map((m) => ({ member: m.email, sponsor: m.detail.referredBy }));
  const unknownSponsors = edges.filter((e) => !emails.has(e.sponsor));
  const asymmetric = [];
  for (const m of merged) {
    for (const r of m.detail?.directReferrals ?? []) {
      const child = r.email ? detailByEmail.get(r.email) : null;
      if (child && child.referredBy !== m.email) {
        asymmetric.push({ listedUnder: m.email, child: r.email, childSays: child.referredBy });
      }
    }
  }
  const genLabels = {};
  for (const m of merged) {
    for (const r of m.detail?.directReferrals ?? []) genLabels[r.genLabel] = (genLabels[r.genLabel] ?? 0) + 1;
  }

  const rates = rateTimeline(commissions);
  const totalOf = (list, sym) => round(list.filter((x) => x.symbol === sym).reduce((s, x) => s + (x.amount ?? 0), 0));

  const memberRows = merged.map((m) => {
    const d = m.detail;
    return {
      email: m.email,
      id: m.id,
      tier: d?.tier ?? m.list.tier ?? null,
      status: d?.status ?? m.list.status ?? null,
      registered: d?.registered ?? m.list.registered ?? null,
      alli: d?.alli ?? parseAmount(m.list.alli),
      usdt: d?.usdt ?? parseAmount(m.list.usdt),
      verified: d?.verified ?? null,
      wallet: d?.wallet ?? null,
      referredBy: d?.referredBy ?? null,
      referralEarnedUsdt: d?.referralEarned?.amount ?? null,
      commissionCount: d?.referralEarned?.commissionCount ?? null,
      questsDone: d?.quests?.done ?? null,
      starsEarned: d?.quests?.stars ?? null,
      directReferrals: d?.directReferralsCount ?? null,
      upgrades: d?.upgrades?.length ?? null,
      upgradedUsdt: d ? totalOf(d.upgrades, 'USDT') : null,
      withdrawnUsdt: d ? totalOf(d.withdrawals, 'USDT') : null,
      withdrawnAlli: d ? totalOf(d.withdrawals, 'ALLI') : null,
      hasProfile: Boolean(d),
    };
  });

  const report = {
    generatedAt: new Date().toISOString(),
    ...meta,
    counts: {
      membersInList: members.length,
      profilesParsed: parsed.filter((p) => p.ok).length,
      profilesUnparsed: parsed.filter((p) => !p.ok).length,
      membersWithoutProfile: memberRows.filter((m) => !m.hasProfile).length,
      commissions: commissions.length,
      sponsorEdges: edges.length,
      rootAccounts: merged.filter((m) => m.detail && !m.detail.referredBy).length,
      walletsTruncated: parsed.filter((p) => p.ok && p.walletTruncated).length,
      profilesWithCappedLists: parsed.filter((p) => p.ok && (p.truncated.commissions || p.truncated.transactions)).length,
    },
    checks: {
      referralEarnedMismatches: earnedMismatches.length,
      sponsorsNotInMemberList: unknownSponsors.length,
      asymmetricReferralLinks: asymmetric.length,
      directReferralGenLabels: genLabels,
    },
    parserWarnings: parsed.filter((p) => p.ok && p.warnings.length).slice(0, 25).map((p) => ({ email: p.email, warnings: p.warnings })),
    unparsedProfiles: parsed.filter((p) => !p.ok).slice(0, 25),
    details: { earnedMismatches: earnedMismatches.slice(0, 50), unknownSponsors: unknownSponsors.slice(0, 50), asymmetric: asymmetric.slice(0, 50) },
    dashboard: dashboard?.values ?? null,
  };

  const commissionHeader = ['date', 'beneficiary', 'source', 'generation', 'percent', 'amount_usdt', 'status'];
  const commissionRow = (c, f = (x) => x) => [c.at ?? c.atRaw, f(c.beneficiary), f(c.source), c.generation, c.percent, c.amount, c.status];
  const memberHeader = [
    'email', 'id', 'tier', 'status', 'registered', 'alli', 'usdt', 'verified', 'wallet', 'referred_by',
    'referral_earned_usdt', 'commission_count', 'quests_done', 'stars_earned', 'direct_referrals',
    'upgrades', 'upgraded_usdt', 'withdrawn_usdt', 'withdrawn_alli',
  ];
  const memberRow = (m, f = (x) => x, keepPrivate = true) => [
    f(m.email), keepPrivate ? m.id : null, m.tier, m.status, keepPrivate ? m.registered : m.registered?.slice(0, 10),
    m.alli, m.usdt, m.verified, keepPrivate ? m.wallet : null, f(m.referredBy),
    m.referralEarnedUsdt, m.commissionCount, m.questsDone, m.starsEarned, m.directReferrals,
    m.upgrades, m.upgradedUsdt, m.withdrawnUsdt, m.withdrawnAlli,
  ];

  // Stable aliases, assigned in order of first appearance.
  const aliases = new Map();
  const alias = (email) => {
    if (!email) return email;
    const key = String(email).toLowerCase();
    if (!aliases.has(key)) aliases.set(key, `member-${aliases.size + 1}`);
    return aliases.get(key);
  };
  const aliasText = (text) => text.replace(EMAIL_G, (e) => alias(e));
  for (const m of memberRows) alias(m.email);

  const sponsorsPrivate = toCsv(['member', 'sponsor'], edges.map((e) => [e.member, e.sponsor]));
  const sponsorsShare = toCsv(['member', 'sponsor'], edges.map((e) => [alias(e.member), alias(e.sponsor)]));

  const files = {
    'private/members.csv': toCsv(memberHeader, memberRows.map((m) => memberRow(m))),
    'private/members.json': JSON.stringify(merged.map((m, i) => ({ ...memberRows[i], profile: m.detail })), null, 2),
    'private/commissions.csv': toCsv(commissionHeader, commissions.map((c) => commissionRow(c))),
    'private/sponsors.csv': sponsorsPrivate,
    'private/report.json': JSON.stringify(report, null, 2),
    'rates.json': JSON.stringify(rates, null, 2),
    'shareable/members.csv': toCsv(memberHeader, memberRows.map((m) => memberRow(m, alias, false))),
    'shareable/commissions.csv': toCsv(commissionHeader, commissions.map((c) => commissionRow(c, alias))),
    'shareable/sponsors.csv': sponsorsShare,
    'shareable/rates.json': JSON.stringify(rates, null, 2),
    'shareable/report.json': aliasText(JSON.stringify(report, null, 2)),
  };
  return { files, report, rates };
}

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);

/** Reads a capture folder, writes the outputs back into it, and returns the report. */
export function consolidateDir(dir) {
  const members = readJson(join(dir, 'members-list.json'), []);
  const commissions = readJson(join(dir, 'commissions.json'), []);
  const dashboard = readJson(join(dir, 'dashboard.json'), null);
  const meta = readJson(join(dir, 'run.json'), {});
  const detailDir = join(dir, 'details');
  const details = existsSync(detailDir)
    ? readdirSync(detailDir).filter((f) => f.endsWith('.json')).map((f) => readJson(join(detailDir, f), null)).filter(Boolean)
    : [];

  const out = buildOutputs({ members, commissions, details, dashboard, meta: { run: meta } });
  for (const [name, content] of Object.entries(out.files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, content);
  }
  return out;
}
