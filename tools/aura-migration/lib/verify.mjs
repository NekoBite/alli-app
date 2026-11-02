// Does ALLI distribute commissions the way the old AURA RUN system did?
//
// The old system's Commissions ledger is the only evidence of its rules. This replays every
// historical upgrade through ALLI's own production `splitCommission` and through the alternatives a
// 4-level plan could plausibly use, and reports which one reproduces the old payouts. Pure: no
// browser, no files. `verify-commissions.mjs` feeds it a crawl.
//
// What it isolates. A commission depends on two separate rules: who QUALIFIES (Silver or Gold, with an
// active membership) and how an unqualified member's share is DISTRIBUTED (kept, rolled up, or
// compressed past). The panel shows tier but not membership expiry, so qualification cannot be read
// off directly. Instead each ancestor counts as qualified in an event if the old system paid them in
// it, and the candidate rules are then asked to reproduce the rest from that. That tests the
// distribution rule on its own. Whether "paid" agrees with "Silver+" is reported separately.
//
// What it cannot do. It can only tell rules apart where the ledger exercises the difference, i.e. an
// unqualified ancestor with a qualified one above. If no such event exists it says "undetermined" and
// does not guess.

import { splitCommission } from '../../../src/features/referrals/rules.ts';

const MICRO = 1_000_000;
const toMicro = (n) => BigInt(Math.round(n * MICRO));
const fromMicro = (b) => Number(b) / MICRO;
/** The panel prints wall-clock times with no zone; read them all the same way so differences hold. */
const seconds = (s) => Date.parse(`${s}Z`) / 1000;
const SILVER_UP = new Set(['SILVER', 'GOLD']);
const TREASURY = /treasury|company|system|house|platform|burn/i;

/** Distinct ways to share one purchase up a sponsor chain. `q[i]` is whether chain[i] qualifies. */
export const CANDIDATES = [
  {
    name: 'rollup',
    description:
      "ALLI's production rule: an unqualified ancestor's share rolls up to the nearest qualified member above; an unqualified Gen 1's share goes to the treasury.",
    run: ({ base, ratesBps, chain, q }) => {
      const upline = chain.map((id, i) => ({ id, qualified: q[i] }));
      const split = splitCommission(base, ratesBps, upline);
      return split.payouts.map((p) => [p.memberId, p.generation, p.amount]);
    },
  },
  {
    name: 'rollup-all',
    description: "Roll-up for every generation, Gen 1 included: an unqualified Gen 1's share also passes up.",
    run: ({ base, ratesBps, chain, q }) => {
      const out = [];
      ratesBps.forEach((bps, g) => {
        const share = (base * BigInt(bps)) / 10_000n;
        if (share === 0n || !chain[g]) return;
        const receiver = q[g] ? chain[g] : chain.find((_, i) => i > g && q[i]);
        if (receiver) out.push([receiver, g + 1, share]);
      });
      return out;
    },
  },
  {
    name: 'skip',
    description: "No roll-up and no compression: an unqualified ancestor's share is simply not paid.",
    run: ({ base, ratesBps, chain, q }) => {
      const out = [];
      ratesBps.forEach((bps, g) => {
        const share = (base * BigInt(bps)) / 10_000n;
        if (share > 0n && chain[g] && q[g]) out.push([chain[g], g + 1, share]);
      });
      return out;
    },
  },
  {
    name: 'compress',
    description:
      'Compression: unqualified ancestors are skipped over and the qualified ones are counted in order, so the k-th qualified ancestor earns generation k’s rate.',
    run: ({ base, ratesBps, chain, q }) => {
      const qualified = chain.filter((_, i) => q[i]);
      const out = [];
      ratesBps.forEach((bps, k) => {
        const share = (base * BigInt(bps)) / 10_000n;
        if (share > 0n && qualified[k]) out.push([qualified[k], k + 1, share]);
      });
      return out;
    },
  },
];

/**
 * Rows of [beneficiary, generation label, amount] → totals. Two views of the same payouts: by who got
 * what (`withLabel` false), and by who got what under which Gen label (true). The labels matter because
 * amounts alone cannot tell "no compression" from "compression" while Gen 2–4 all pay the same rate.
 */
function totals(rows, withLabel) {
  const m = new Map();
  for (const [id, generation, amount] of rows) {
    if (amount <= 0n) continue;
    const key = withLabel ? `${id} @Gen${generation}` : id;
    m.set(key, (m.get(key) ?? 0n) + amount);
  }
  return m;
}
const same = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const show = (m) => Object.fromEntries([...m].map(([k, v]) => [k, fromMicro(v)]));

/** email → { tier, sponsor, upgradeTimes }. Upgrade times are when the member became Silver+. */
export function buildTree(members) {
  const tree = new Map();
  for (const m of members) {
    const profile = m.profile ?? null;
    const upgrades = (profile?.upgrades ?? []).filter((u) => !u.status || u.status === 'CONFIRMED');
    tree.set(String(m.email).toLowerCase(), {
      tier: String(m.tier ?? profile?.tier ?? '').toUpperCase(),
      sponsor: (m.referredBy ?? profile?.referredBy ?? null)?.toLowerCase() ?? null,
      upgrades: upgrades.filter((u) => u.at).map((u) => ({ ...u, t: seconds(u.at) })).sort((a, b) => a.t - b.t),
      hasProfile: Boolean(profile),
    });
  }
  return tree;
}

/** The sponsors above a member, nearest first. Stops at an unknown sponsor or a loop. */
export function uplineOf(tree, email, limit = 24) {
  const out = [];
  const seen = new Set([email]);
  let at = tree.get(email)?.sponsor;
  while (at && !seen.has(at) && out.length < limit) {
    out.push(at);
    seen.add(at);
    at = tree.get(at)?.sponsor;
  }
  return out;
}

/** Whether a member held Silver+ when `t` happened, judged from their own upgrade history. */
export function qualifiedByTier(tree, email, t) {
  const node = tree.get(email);
  if (!node) return { qualified: false, basis: 'unknown-member' };
  if (node.upgrades.some((u) => u.t <= t)) return { qualified: true, basis: 'upgrade' };
  // Silver or Gold with no upgrade on record: an admin override, or a Gold earned by recruiting.
  if (SILVER_UP.has(node.tier) && node.upgrades.length === 0) return { qualified: true, basis: 'override' };
  return { qualified: false, basis: 'none' };
}

/**
 * One event per upgrade: the member's profile lists their upgrades, and the commission rows booked a
 * second or so after each one are its payouts. Rows with no upgrade on record become ledger-only
 * events, so nothing in the ledger is dropped.
 */
export function buildEvents(members, commissions, { window = 5 } = {}) {
  const rows = commissions
    .map((r, i) => ({ ...r, i, t: r.at ? seconds(r.at) : NaN }))
    .filter((r) => Number.isFinite(r.t));
  const bySource = new Map();
  for (const r of rows) bySource.set(r.source, [...(bySource.get(r.source) ?? []), r]);
  const claimed = new Set();
  const events = [];

  for (const m of members) {
    const email = String(m.email).toLowerCase();
    const upgrades = (m.profile?.upgrades ?? [])
      .filter((u) => u.at && (!u.status || u.status === 'CONFIRMED'))
      .map((u) => ({ ...u, t: seconds(u.at) }))
      .sort((a, b) => a.t - b.t);
    upgrades.forEach((u, k) => {
      const mine = (bySource.get(email) ?? []).filter((r) => !claimed.has(r.i) && r.t >= u.t - 1 && r.t <= u.t + window);
      mine.forEach((r) => claimed.add(r.i));
      events.push({ buyer: email, at: u.at, t: u.t, amount: u.amount ?? null, symbol: u.symbol ?? null, ordinal: k + 1, rows: mine, ledgerOnly: false });
    });
  }

  // Whatever the upgrade lists did not explain: grouped by buyer and second.
  const leftover = new Map();
  for (const r of rows) {
    if (claimed.has(r.i)) continue;
    const key = `${r.source}|${r.at}`;
    leftover.set(key, [...(leftover.get(key) ?? []), r]);
  }
  for (const group of leftover.values()) {
    const first = group[0];
    const inferred = median(group.filter((r) => r.percent > 0 && r.amount != null).map((r) => (r.amount * 100) / r.percent));
    events.push({ buyer: first.source, at: first.at, t: first.t, amount: inferred, symbol: 'USDT', ordinal: null, rows: group, ledgerOnly: true });
  }
  return events.sort((a, b) => a.t - b.t);
}

const median = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

function rateSteps(commissions) {
  const byGen = new Map();
  for (const r of commissions) {
    if (!r.at || r.generation == null || r.percent == null) continue;
    byGen.set(r.generation, [...(byGen.get(r.generation) ?? []), { t: seconds(r.at), percent: r.percent }]);
  }
  for (const list of byGen.values()) list.sort((a, b) => a.t - b.t);
  return byGen;
}
function rateAt(steps, generation, t) {
  const list = steps.get(generation);
  if (!list?.length) return 0;
  let v = list[0].percent;
  for (const x of list) {
    if (x.t <= t + 5) v = x.percent;
    else break;
  }
  return v;
}

/** @returns the full report. */
export function verify({ members, commissions }, { maxGen, window = 5, samples = 10 } = {}) {
  const tree = buildTree(members);
  const events = buildEvents(members, commissions, { window });
  const steps = rateSteps(commissions);
  const generations = maxGen ?? Math.min(8, Math.max(0, ...commissions.map((r) => r.generation ?? 0)));

  const structure = { rows: 0, beneficiaryNotInUpline: 0, labelEqualsDepth: 0, labelBelowDepth: 0, labelAboveDepth: 0, treasuryRows: 0 };
  const samplesOf = { notInUpline: [], labelMismatch: [], amount: [], omitted: [], paidUnqualified: [] };
  const rowsPerEvent = {};
  const byAmountOrdinal = {};
  const qual = Object.fromEntries(Array.from({ length: generations }, (_, i) => [i + 1, { tierQualifiedPaid: 0, tierQualifiedAbsent: 0, tierUnqualifiedPaid: 0, tierUnqualifiedAbsent: 0 }]));
  const bases = { override: 0 };
  const amountChecks = { rowsChecked: 0, rowsOff: 0 };
  // `matched`/`discriminatingMatched` compare who was paid what AND under which Gen label; the
  // `...Amounts` pair compares amounts only. They differ where labels are the only evidence.
  const variants = CANDIDATES.map((c) => ({
    name: c.name, description: c.description, evaluated: 0,
    matched: 0, discriminatingMatched: 0, matchedAmounts: 0, discriminatingMatchedAmounts: 0, mismatches: [],
  }));
  let discriminatingAmountsEvents = 0;
  const eventLines = [];
  let discriminatingEvents = 0;
  let silent = 0;
  let noSponsorEvents = 0;

  for (const e of events) {
    const chain = uplineOf(tree, e.buyer);
    const byBeneficiary = new Map();
    for (const r of e.rows) byBeneficiary.set(r.beneficiary, [...(byBeneficiary.get(r.beneficiary) ?? []), r]);

    rowsPerEvent[e.rows.length] = (rowsPerEvent[e.rows.length] ?? 0) + 1;
    // An upgrade by someone with no sponsor cannot pay anyone, so it says nothing about what triggers
    // a commission. Count only upgrades that had somebody above them.
    if (chain.length === 0) noSponsorEvents += 1;
    else {
      const key = `${e.amount ?? '?'} #${e.ordinal ?? '?'}`;
      const slot = (byAmountOrdinal[key] ??= { events: 0, withCommission: 0 });
      slot.events += 1;
      if (e.rows.length > 0) slot.withCommission += 1;
    }

    // Rows: is the beneficiary really above the buyer, and does the label match the depth?
    for (const r of e.rows) {
      structure.rows += 1;
      const depth = chain.indexOf(r.beneficiary) + 1;
      if (TREASURY.test(r.beneficiary) || !r.beneficiary.includes('@')) structure.treasuryRows += 1;
      else if (depth === 0) {
        structure.beneficiaryNotInUpline += 1;
        if (samplesOf.notInUpline.length < samples) samplesOf.notInUpline.push({ buyer: e.buyer, beneficiary: r.beneficiary, generation: r.generation, at: r.at });
      } else if (r.generation === depth) structure.labelEqualsDepth += 1;
      else {
        if (r.generation < depth) structure.labelBelowDepth += 1;
        else structure.labelAboveDepth += 1;
        if (samplesOf.labelMismatch.length < samples) samplesOf.labelMismatch.push({ buyer: e.buyer, beneficiary: r.beneficiary, label: r.generation, depth, amount: r.amount, at: r.at });
      }
      if (e.amount != null && r.percent != null && r.amount != null) {
        amountChecks.rowsChecked += 1;
        if (Math.abs((e.amount * r.percent) / 100 - r.amount) > 1e-6) {
          amountChecks.rowsOff += 1;
          if (samplesOf.amount.length < samples) samplesOf.amount.push({ buyer: e.buyer, generation: r.generation, base: e.amount, percent: r.percent, amount: r.amount });
        }
      }
    }

    // Qualification, observed (paid) against stated (tier), per depth.
    const q = chain.map((a) => (byBeneficiary.get(a) ?? []).length > 0);
    chain.forEach((a, i) => {
      const depth = i + 1;
      if (depth > generations) return;
      const tier = qualifiedByTier(tree, a, e.t);
      if (tier.basis === 'override') bases.override += 1;
      const cell = qual[depth];
      if (tier.qualified) cell[q[i] ? 'tierQualifiedPaid' : 'tierQualifiedAbsent'] += 1;
      else cell[q[i] ? 'tierUnqualifiedPaid' : 'tierUnqualifiedAbsent'] += 1;
      if (tier.qualified && !q[i] && samplesOf.omitted.length < samples) samplesOf.omitted.push({ buyer: e.buyer, ancestor: a, depth, at: e.at });
      if (!tier.qualified && q[i] && samplesOf.paidUnqualified.length < samples) samplesOf.paidUnqualified.push({ buyer: e.buyer, ancestor: a, depth, at: e.at, tier: tree.get(a)?.tier ?? null });
    });
    if (chain.length > 0 && e.rows.length === 0) silent += 1;

    // Replay each rule on this event.
    const actualRows = e.rows.filter((r) => r.beneficiary.includes('@')).map((r) => [r.beneficiary, r.generation, toMicro(r.amount ?? 0)]);
    const record = { buyer: e.buyer, at: e.at, amount: e.amount, ordinal: e.ordinal, depthKnown: chain.length, paid: q.map((p) => (p ? 'P' : '-')).join(''), actual: show(totals(actualRows, true)), candidates: {}, discriminating: false };
    if (e.amount != null && e.amount > 0 && chain.length > 0) {
      const base = toMicro(e.amount);
      const ratesBps = Array.from({ length: generations }, (_, g) => Math.round(rateAt(steps, g + 1, e.t) * 100));
      const results = CANDIDATES.map((c) => c.run({ base, ratesBps, chain, q }));
      const exact = results.map((r) => totals(r, true));
      const amounts = results.map((r) => totals(r, false));
      const actualExact = totals(actualRows, true);
      const actualAmounts = totals(actualRows, false);
      const splitsExact = exact.some((r) => !same(r, exact[0]));
      const splitsAmounts = amounts.some((r) => !same(r, amounts[0]));
      if (splitsExact) discriminatingEvents += 1;
      if (splitsAmounts) discriminatingAmountsEvents += 1;
      record.discriminating = splitsExact;
      CANDIDATES.forEach((c, i) => {
        const v = variants[i];
        const okExact = same(exact[i], actualExact);
        const okAmounts = same(amounts[i], actualAmounts);
        v.evaluated += 1;
        if (okExact) v.matched += 1;
        if (okAmounts) v.matchedAmounts += 1;
        if (splitsExact && okExact) v.discriminatingMatched += 1;
        if (splitsAmounts && okAmounts) v.discriminatingMatchedAmounts += 1;
        record.candidates[c.name] = okExact;
        if (!okExact && v.mismatches.length < samples) v.mismatches.push({ buyer: e.buyer, at: e.at, paid: record.paid, expected: show(exact[i]), actual: show(actualExact) });
      });
    }
    eventLines.push(record);
  }

  // Which kinds of transaction are followed by a commission? Anything but upgrades is a second trigger.
  const transactionTypes = {};
  const ledgerBySource = new Map();
  for (const r of commissions) if (r.at) ledgerBySource.set(r.source, [...(ledgerBySource.get(r.source) ?? []), seconds(r.at)]);
  for (const m of members) {
    const email = String(m.email).toLowerCase();
    const mine = ledgerBySource.get(email) ?? [];
    for (const tx of m.profile?.transactions ?? []) {
      if (!tx.at || !tx.type) continue;
      const slot = (transactionTypes[tx.type] ??= { seen: 0, followedByCommission: 0 });
      slot.seen += 1;
      const t = seconds(tx.at);
      if (mine.some((rt) => rt >= t && rt <= t + window)) slot.followedByCommission += 1;
    }
  }

  const decide = (matchedKey, count, what) => {
    const winners = variants.filter((v) => count > 0 && v[matchedKey] === count);
    const best = [...variants].sort((a, b) => b[matchedKey] - a[matchedKey])[0];
    if (count === 0) {
      return {
        status: 'undetermined',
        text: `No upgrade in the ledger separates these rules ${what}: none has an unqualified ancestor with a qualified one above. The ledger cannot say how an unqualified member’s share was handled. Ask the client, or look for a chain that exercises it.`,
      };
    }
    if (winners.length === 1) return { status: 'determined', rule: winners[0].name, text: `Only "${winners[0].name}" reproduces every one of the ${count} upgrades that distinguish the rules ${what}.` };
    if (winners.length > 1) {
      return { status: 'ambiguous', rules: winners.map((w) => w.name), text: `${winners.map((w) => `"${w.name}"`).join(' and ')} both reproduce all ${count} distinguishing upgrades ${what}; the ledger cannot separate them.` };
    }
    return {
      status: 'none-fit',
      closest: best.name,
      text: `No candidate reproduces all ${count} distinguishing upgrades ${what} (closest: "${best.name}", ${best[matchedKey]}). The old system follows a rule not listed here, or something other than distribution (qualification, a second trigger) is changing the payouts. Read the mismatches.`,
    };
  };
  const verdict = decide('discriminatingMatched', discriminatingEvents, 'by amount and Gen label');
  const verdictByAmount = decide('discriminatingMatchedAmounts', discriminatingAmountsEvents, 'by amount alone');

  return {
    verdict,
    verdictByAmount,
    events: {
      total: events.length,
      withUpgradeRecord: events.filter((e) => !e.ledgerOnly).length,
      ledgerOnly: events.filter((e) => e.ledgerOnly).length,
      silentWithAnUpline: silent,
      noSponsor: noSponsorEvents,
      discriminating: discriminatingEvents,
      discriminatingByAmount: discriminatingAmountsEvents,
      rowsPerEvent,
      byAmountAndOrdinal: byAmountOrdinal,
    },
    structure: { ...structure, samples: { notInUpline: samplesOf.notInUpline, labelMismatch: samplesOf.labelMismatch } },
    qualification: { byDepth: qual, tierBasisOverrideCount: bases.override, paidWhileTierUnqualifiedSamples: samplesOf.paidUnqualified, tierQualifiedButNotPaidSamples: samplesOf.omitted, note: 'tierQualifiedAbsent is the membership-lapse signal: Silver+ and not paid. Membership expiry is not on the profile, so it cannot be checked directly.' },
    amounts: { ...amountChecks, samples: samplesOf.amount },
    transactionTypes,
    variants,
    eventLines,
  };
}
