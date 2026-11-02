import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CANDIDATES, buildEvents, buildTree, qualifiedByTier, uplineOf, verify } from '../lib/verify.mjs';

// Invented people. A "world" is a set of members with sponsors and upgrade times, plus a ledger.
const BASE = 25;
const RATES = [20, 10, 10, 10];

// A member is Silver by tier unless an upgrade list says when they became Silver. Only the upgrades a
// test cares about are listed, so every other member contributes no event of their own.
const member = (email, { tier = 'SILVER', sponsor = null, upgrades = [] } = {}) => ({
  email,
  tier,
  referredBy: sponsor,
  profile: {
    upgrades: upgrades.map((at) => ({ amount: BASE, symbol: 'USDT', status: 'CONFIRMED', at })),
    transactions: [],
  },
});
const row = (at, beneficiary, source, generation, percent) => ({
  at, atRaw: at, beneficiary, source, generation, percent, amount: (BASE * percent) / 100, status: 'CREDITED',
});
/** The second after an upgrade, which is when the old system booked the commissions. */
const after = (at) => at.replace(/:00$/, ':01');

/**
 * What the OLD system would have written, per rule, for a buyer whose sponsors are `chain` (nearest
 * first) with `qualified[i]`. Hand-written here and deliberately not sharing code with the verifier:
 * the test is that the verifier can tell these apart.
 */
function ledger(rule, buyer, chain, qualified, at, rates = RATES) {
  const t = after(at);
  const rows = [];
  if (rule === 'skip') {
    chain.forEach((a, i) => {
      if (i < rates.length && qualified[i]) rows.push(row(t, a, buyer, i + 1, rates[i]));
    });
  } else if (rule === 'rollup') {
    chain.forEach((a, i) => {
      if (i >= rates.length) return;
      if (qualified[i]) return rows.push(row(t, a, buyer, i + 1, rates[i]));
      if (i === 0) return; // an unqualified Gen 1 goes to the treasury: no member row
      const next = chain.findIndex((_, j) => j > i && qualified[j]);
      if (next >= 0) rows.push(row(t, chain[next], buyer, i + 1, rates[i]));
    });
  } else if (rule === 'compress') {
    const qualifiedChain = chain.filter((_, i) => qualified[i]);
    qualifiedChain.forEach((a, k) => {
      if (k < rates.length) rows.push(row(t, a, buyer, k + 1, rates[k]));
    });
  }
  return rows;
}

/** A chain where everyone qualifies. It exists to show the ledger every generation's rate. */
function provider() {
  const people = ['p5', 'p4', 'p3', 'p2', 'p1'].map((n, i, all) => member(`${n}@x.io`, { sponsor: i === 0 ? null : `${all[i - 1]}@x.io` }));
  const buyer = member('pbuyer@x.io', { sponsor: 'p1@x.io', upgrades: ['2026-10-15T09:00:00'] });
  const rows = ledger('skip', 'pbuyer@x.io', ['p1@x.io', 'p2@x.io', 'p3@x.io', 'p4@x.io'], [true, true, true, true], '2026-10-15T09:00:00');
  return { members: [...people, buyer], rows };
}

/** buyer <- A (silver) <- B (LEATHER) <- C (silver) <- D (silver): the case that separates the rules. */
function skipChain(rule) {
  const members = [
    member('d@x.io'),
    member('c@x.io', { sponsor: 'd@x.io' }),
    member('b@x.io', { tier: 'LEATHER', sponsor: 'c@x.io' }),
    member('a@x.io', { sponsor: 'b@x.io' }),
    member('buyer@x.io', { sponsor: 'a@x.io', upgrades: ['2026-11-01T12:00:00'] }),
  ];
  // The chain above the buyer, nearest first, with who qualifies. B is Leather, so B does not.
  const rows = ledger(rule, 'buyer@x.io', ['a@x.io', 'b@x.io', 'c@x.io', 'd@x.io'], [true, false, true, true], '2026-11-01T12:00:00');
  return { members, rows };
}

/** buyer <- B (LEATHER, Gen 1) <- C (silver): the case that separates "rollup" from "rollup-all". */
function gen1Chain(rule) {
  const members = [
    member('c2@x.io'),
    member('b2@x.io', { tier: 'LEATHER', sponsor: 'c2@x.io' }),
    member('buyer2@x.io', { sponsor: 'b2@x.io', upgrades: ['2026-11-01T13:00:00'] }),
  ];
  const rows = ledger(rule, 'buyer2@x.io', ['b2@x.io', 'c2@x.io'], [false, true], '2026-11-01T13:00:00');
  return { members, rows };
}

const world = (...parts) => ({ members: parts.flatMap((p) => p.members), commissions: parts.flatMap((p) => p.rows) });
const winner = (report) => report.verdict.rule ?? report.verdict.rules ?? report.verdict.closest;

describe('the tree and qualification', () => {
  const tree = buildTree([
    member('top@x.io'),
    member('mid@x.io', { tier: 'LEATHER', sponsor: 'top@x.io' }),
    member('low@x.io', { sponsor: 'mid@x.io', upgrades: ['2026-11-01T12:00:00'] }),
    member('override@x.io', { tier: 'GOLD', upgrades: [] }),
  ]);

  it('walks the sponsors above a member, nearest first, and stops at a loop', () => {
    assert.deepEqual(uplineOf(tree, 'low@x.io'), ['mid@x.io', 'top@x.io']);
    const loop = buildTree([member('a@x.io', { sponsor: 'b@x.io' }), member('b@x.io', { sponsor: 'a@x.io' })]);
    assert.deepEqual(uplineOf(loop, 'a@x.io'), ['b@x.io']);
  });

  it('judges Silver from the member’s own upgrade history, at the time of the event', () => {
    const t = (s) => Date.parse(`${s}Z`) / 1000;
    assert.equal(qualifiedByTier(tree, 'low@x.io', t('2026-10-31T00:00:00')).qualified, false); // before they upgraded
    assert.equal(qualifiedByTier(tree, 'low@x.io', t('2026-11-02T00:00:00')).qualified, true);
    assert.equal(qualifiedByTier(tree, 'mid@x.io', t('2026-11-02T00:00:00')).qualified, false); // Leather
    assert.deepEqual(qualifiedByTier(tree, 'override@x.io', t('2026-11-02T00:00:00')), { qualified: true, basis: 'override' });
    assert.equal(qualifiedByTier(tree, 'nobody@x.io', 0).basis, 'unknown-member');
  });
});

describe('events', () => {
  it('pairs each upgrade with the commissions booked just after it, and keeps the rest', () => {
    const w = world(skipChain('skip'));
    const events = buildEvents(w.members, [...w.commissions, row('2026-11-05T08:00:01', 'a@x.io', 'ghost@x.io', 1, 20)]);
    const mine = events.find((e) => e.buyer === 'buyer@x.io');
    assert.equal(mine.rows.length, 3);
    assert.equal(mine.ordinal, 1);
    assert.equal(events.filter((e) => e.ledgerOnly).length, 1, 'a row with no upgrade on record is not dropped');
  });
});

describe('which distribution rule the ledger shows', () => {
  for (const rule of ['skip', 'rollup', 'compress']) {
    it(`recognises "${rule}" and rejects the others, when the ledger exercises the difference`, () => {
      const parts = rule === 'rollup' ? [provider(), skipChain(rule), gen1Chain(rule)] : [provider(), skipChain(rule)];
      const report = verify(world(...parts));
      assert.equal(report.verdict.status, 'determined', report.verdict.text);
      assert.equal(report.verdict.rule, rule);
      for (const v of report.variants) {
        if (v.name !== rule) assert.ok(v.discriminatingMatched < report.events.discriminating, `${v.name} must fail somewhere`);
      }
    });
  }

  it('needs the Gen labels to tell "skip" from "compress" while Gen 2–4 pay the same rate', () => {
    // 20/10/10/10: the 2nd qualified ancestor earns 10% either way, so the amounts are identical. Only
    // the label differs (Gen 3 under skip, Gen 2 under compression). Amounts alone cannot decide.
    for (const rule of ['skip', 'compress']) {
      const report = verify(world(provider(), skipChain(rule)));
      assert.equal(report.verdictByAmount.status, 'ambiguous');
      assert.deepEqual([...report.verdictByAmount.rules].sort(), ['compress', 'skip']);
      assert.equal(report.verdict.status, 'determined');
      assert.equal(report.verdict.rule, rule);
    }
  });

  it('says "ambiguous", not a guess, when two rules fit every distinguishing upgrade', () => {
    // Under production roll-up, Gen 1 is qualified everywhere here, so "rollup" and "rollup-all" agree.
    const report = verify(world(provider(), skipChain('rollup')));
    assert.equal(report.verdict.status, 'ambiguous');
    assert.deepEqual([...report.verdict.rules].sort(), ['rollup', 'rollup-all']);
  });

  it('says "undetermined" when no upgrade separates the rules', () => {
    // Everyone qualified: every rule pays the same.
    const report = verify(world(provider()));
    assert.equal(report.verdict.status, 'undetermined');
    assert.equal(report.events.discriminating, 0);
  });

  it('says "none-fit" when the old system follows a rule that is not listed', () => {
    // B unqualified, and the NEXT qualified ancestor is paid TWICE B's share: not any listed rule.
    const w = skipChain('rollup');
    const doubled = w.rows.map((r) => (r.beneficiary === 'c@x.io' && r.generation === 2 ? { ...r, amount: r.amount * 2 } : r));
    const report = verify(world(provider(), { members: w.members, rows: doubled }));
    assert.equal(report.verdict.status, 'none-fit');
  });

  it('uses the rate in force at each upgrade, so a rate cut is not a mismatch', () => {
    // Gen 1 paid 40% until 31 Oct and 20% after. Every event follows "skip" at its own rate.
    const early = ledger('skip', 'old@x.io', ['a@x.io'], [true], '2026-10-20T10:00:00', [40, 10, 10, 10]);
    const late = ledger('skip', 'new@x.io', ['a@x.io'], [true], '2026-11-02T10:00:00', [20, 10, 10, 10]);
    const members = [
      member('a@x.io'),
      member('old@x.io', { sponsor: 'a@x.io', upgrades: ['2026-10-20T10:00:00'] }),
      member('new@x.io', { sponsor: 'a@x.io', upgrades: ['2026-11-02T10:00:00'] }),
    ];
    const report = verify({ members, commissions: [...early, ...late] });
    const skip = report.variants.find((v) => v.name === 'skip');
    assert.equal(skip.matched, skip.evaluated);
    assert.equal(report.amounts.rowsOff, 0);
  });
});

describe('structural evidence, which needs no assumption about qualification', () => {
  it('shows the generation label always equals the depth when nothing is skipped or compressed', () => {
    const report = verify(world(provider(), skipChain('skip')));
    assert.equal(report.structure.labelBelowDepth, 0);
    assert.equal(report.structure.labelAboveDepth, 0);
    assert.equal(report.structure.beneficiaryNotInUpline, 0);
  });

  it('shows compression as labels below the depth', () => {
    const report = verify(world(provider(), skipChain('compress')));
    assert.equal(report.structure.labelBelowDepth, 2); // C is at depth 3 labelled Gen 2; D at 4 labelled Gen 3
    assert.deepEqual(report.structure.samples.labelMismatch.map((s) => [s.beneficiary, s.label, s.depth]), [
      ['c@x.io', 2, 3],
      ['d@x.io', 3, 4],
    ]);
  });

  it('shows roll-up as a member paid on one event under two generation labels', () => {
    const report = verify(world(provider(), skipChain('rollup')));
    const cRows = report.events.rowsPerEvent;
    assert.equal(cRows[4], 2, 'the provider event and the roll-up event each have four rows');
    assert.equal(report.structure.labelBelowDepth, 1, 'the rolled-up share carries Gen 2 for a member at depth 3');
  });

  it('flags a payout to someone who is not above the buyer, and counts treasury rows apart', () => {
    const w = world(provider(), skipChain('skip'));
    const report = verify({
      members: w.members,
      commissions: [...w.commissions, row('2026-11-01T12:00:01', 'stranger@x.io', 'buyer@x.io', 1, 20), row('2026-11-01T12:00:01', 'treasury', 'buyer@x.io', 4, 10)],
    });
    assert.equal(report.structure.beneficiaryNotInUpline, 1);
    assert.equal(report.structure.treasuryRows, 1);
  });

  it('checks every payout’s amount against base × percent', () => {
    const w = world(provider(), skipChain('skip'));
    const bad = w.commissions.map((r, i) => (i === 0 ? { ...r, amount: r.amount + 1 } : r));
    const report = verify({ members: w.members, commissions: bad });
    assert.equal(report.amounts.rowsOff, 1);
    assert.ok(report.amounts.rowsChecked > 5);
  });
});

describe('what triggers a commission', () => {
  it('shows a later upgrade that paid nothing, so "first upgrade only" can be read off the data', () => {
    // The buyer upgrades to Silver (paid) and then to a 75 USDT tier (nothing booked).
    const members = [
      member('a@x.io'),
      { ...member('buyer@x.io', { sponsor: 'a@x.io', upgrades: ['2026-10-20T10:00:00'] }) },
    ];
    members[1].profile.upgrades.push({ amount: 75, symbol: 'USDT', status: 'CONFIRMED', at: '2026-10-25T10:00:00' });
    const report = verify({ members, commissions: ledger('skip', 'buyer@x.io', ['a@x.io'], [true], '2026-10-20T10:00:00') });
    assert.deepEqual(report.events.byAmountAndOrdinal['25 #1'], { events: 1, withCommission: 1 });
    assert.deepEqual(report.events.byAmountAndOrdinal['75 #2'], { events: 1, withCommission: 0 });
  });

  it('does not count a sponsorless account’s upgrade, which could not have paid anyone', () => {
    const members = [member('root@x.io', { upgrades: ['2026-10-20T10:00:00'] })];
    const report = verify({ members, commissions: [] });
    assert.equal(report.events.noSponsor, 1);
    assert.deepEqual(report.events.byAmountAndOrdinal, {});
  });

  it('finds which kinds of transaction are followed by a commission', () => {
    const w = world(provider(), skipChain('skip'));
    const buyer = w.members.find((m) => m.email === 'buyer@x.io');
    buyer.profile.transactions = [
      { at: '2026-11-01T12:00:00', type: 'UPGRADE_PAYMENT', currency: 'USDT', amount: -25, balance: 0 },
      { at: '2026-11-01T11:59:00', type: 'DEPOSIT', currency: 'USDT', amount: 25, balance: 25 },
    ];
    const report = verify(w);
    assert.deepEqual(report.transactionTypes.UPGRADE_PAYMENT, { seen: 1, followedByCommission: 1 });
    assert.deepEqual(report.transactionTypes.DEPOSIT, { seen: 1, followedByCommission: 0 });
  });
});

describe('qualification, as the old system paid it against what the tier says', () => {
  it('counts who was paid and who was not, by depth, against tier', () => {
    const report = verify(world(provider(), skipChain('skip')));
    const gen2 = report.qualification.byDepth[2];
    // B is Leather and was not paid; the provider's Gen 2 was Silver and was.
    assert.equal(gen2.tierUnqualifiedAbsent, 1);
    assert.equal(gen2.tierQualifiedPaid, 1);
    assert.equal(gen2.tierUnqualifiedPaid, 0);
  });

  it('surfaces a Silver ancestor who was not paid: the sign of a lapsed membership', () => {
    const w = skipChain('skip');
    const withoutC = w.rows.filter((r) => r.beneficiary !== 'c@x.io');
    const report = verify(world(provider(), { members: w.members, rows: withoutC }));
    assert.equal(report.qualification.byDepth[3].tierQualifiedAbsent, 1);
    assert.equal(report.qualification.tierQualifiedButNotPaidSamples[0].ancestor, 'c@x.io');
  });
});

describe('production parity', () => {
  it('the "rollup" candidate is ALLI’s production splitCommission, not a copy', () => {
    const rollup = CANDIDATES.find((c) => c.name === 'rollup');
    const rows = rollup.run({ base: 25_000_000n, ratesBps: [2000, 1000, 1000, 1000], chain: ['a', 'b', 'c', 'd'], q: [true, false, true, true] });
    // [beneficiary, generation label, amount in millionths]: b is unqualified, so c is paid b's Gen 2
    // share as well as its own Gen 3 share, and nobody is paid as b.
    assert.deepEqual(rows, [
      ['a', 1, 5_000_000n],
      ['c', 2, 2_500_000n],
      ['c', 3, 2_500_000n],
      ['d', 4, 2_500_000n],
    ]);
  });
});
