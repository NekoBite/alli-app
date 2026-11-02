import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeWallet, idFromHref, idsFromJson } from '../lib/ids.mjs';
import { buildOutputs, rateTimeline } from '../lib/consolidate.mjs';
import { profile } from './fixtures.mjs';

const WALLET = `0x${'cd'.repeat(20)}`;
const c = (at, beneficiary, source, generation, percent, amount) => ({
  at, atRaw: at, beneficiary, source, generation, percent, amount, status: 'CREDITED',
});

describe('rateTimeline', () => {
  it('finds where Gen 1 changed and leaves Gen 2 alone', () => {
    const rows = [
      c('2026-10-30T22:20:11', 'a@x.io', 'b@x.io', 1, 40, 10),
      c('2026-10-30T22:20:11', 'c@x.io', 'b@x.io', 2, 10, 2.5),
      c('2026-10-31T13:42:41', 'a@x.io', 'd@x.io', 1, 40, 10),
      c('2026-11-01T11:29:40', 'a@x.io', 'e@x.io', 1, 20, 5),
      c('2026-11-01T11:29:40', 'c@x.io', 'e@x.io', 2, 10, 2.5),
    ];
    const { combinations, changes } = rateTimeline(rows);
    assert.deepEqual(changes, [
      { generation: 1, from: 40, to: 20, lastRowAtOldRate: '2026-10-31T13:42:41', firstRowAtNewRate: '2026-11-01T11:29:40' },
    ]);
    const gen1 = combinations.filter((x) => x.generation === 1);
    assert.deepEqual(gen1.map((x) => [x.percent, x.count, x.firstAt, x.lastAt]), [
      [40, 2, '2026-10-30T22:20:11', '2026-10-31T13:42:41'],
      [20, 1, '2026-11-01T11:29:40', '2026-11-01T11:29:40'],
    ]);
  });

  it('reports no change when the rate never moved', () => {
    const { changes } = rateTimeline([c('2026-10-01T00:00:00', 'a@x.io', 'b@x.io', 1, 20, 5), c('2026-10-02T00:00:00', 'a@x.io', 'c@x.io', 1, 20, 5)]);
    assert.deepEqual(changes, []);
  });
});

describe('ids', () => {
  it('reads ids from links and from API payloads', () => {
    assert.equal(idFromHref('/members/cexample0000000000000001'), 'cexample0000000000000001');
    assert.equal(idFromHref('https://x.dev/members/cexample0000000000000001?tab=1'), 'cexample0000000000000001');
    assert.equal(idFromHref('/members'), null);
    assert.equal(idFromHref('/members/not-an-id'), null);

    const map = idsFromJson({
      data: [
        { id: 'cexample0000000000000001', email: 'A@X.io', tier: 'GOLD' },
        { beneficiary: { id: 'cexample0000000000000002', email: 'b@x.io' }, amount: 5 },
        { id: 'plain', email: 'c@x.io' },
      ],
    });
    assert.equal(map.get('a@x.io'), 'cexample0000000000000001');
    assert.equal(map.get('b@x.io'), 'cexample0000000000000002');
    assert.equal(map.has('c@x.io'), false);
  });

  it('completes a truncated wallet only from a matching full address', () => {
    assert.equal(completeWallet('0xCDCDCDCDCD…', [{ wallet: WALLET }]), WALLET);
    assert.equal(completeWallet('0xABABABABAB…', [{ wallet: WALLET }]), null);
    assert.equal(completeWallet('0x12…', [{ wallet: WALLET }]), null); // too short to be safe
  });
});

describe('buildOutputs', () => {
  // top ← sponsor ← kid. `sponsor` was paid 10 at the old Gen 1 rate and 5 at the new one.
  const members = [
    { email: 'top@example.com', id: 'cmtop00000000000000000001', tier: 'GOLD', status: 'ACTIVE', alli: '1', usdt: '2' },
    { email: 'sponsor@example.com', id: 'cexample0000000000000001', tier: 'GOLD', status: 'ACTIVE', alli: '100,000', usdt: '5' },
    { email: 'kid@example.com', id: 'cmkid000000000000000000001', tier: 'SILVER', status: 'ACTIVE', alli: '0', usdt: '0' },
  ];
  const commissions = [
    c('2026-10-31T13:42:41', 'sponsor@example.com', 'kid@example.com', 1, 40, 10),
    c('2026-11-01T11:29:40', 'sponsor@example.com', 'other@example.com', 1, 20, 5),
  ];
  const details = [
    {
      id: 'cexample0000000000000001',
      tokens: profile({
        email: 'sponsor@example.com',
        earned: ['15', 'USDT', '2 commission(s)'],
        commissions: ['kid@example.com', '+10 USDT', 'other@example.com', '+5 USDT'],
        referrals: ['Gen 1', 'kid@example.com', 'SILVER', 'commission paid ✓'],
        wallet: '0xCDCDCDCDCD…',
      }),
      api: [{ json: { wallet: WALLET } }],
    },
    {
      id: 'cmkid000000000000000000001',
      tokens: profile({
        email: 'kid@example.com', id: 'cmkid000000000000000000001', tier: 'SILVER', referredBy: 'sponsor@example.com',
        earned: ['0', 'USDT', '0 commission(s)'], commissions: ['None yet.'], referrals: ['No referrals yet.'],
      }),
      api: [],
    },
  ];

  const out = buildOutputs({ members, commissions, details });

  it('merges the list with the profiles and completes the wallet from the API', () => {
    const rows = JSON.parse(out.files['private/members.json']);
    const sponsor = rows.find((r) => r.email === 'sponsor@example.com');
    assert.equal(sponsor.wallet, WALLET);
    assert.equal(sponsor.alli, 100000);
    assert.equal(sponsor.hasProfile, true);
    assert.equal(rows.find((r) => r.email === 'top@example.com').hasProfile, false);
    assert.equal(out.report.counts.membersWithoutProfile, 1);
  });

  it('cross-checks each profile against the commission ledger', () => {
    assert.equal(out.report.checks.referralEarnedMismatches, 0);
    const wrong = buildOutputs({ members, commissions: commissions.slice(0, 1), details });
    assert.equal(wrong.report.checks.referralEarnedMismatches, 1);
  });

  it('builds the sponsor tree and checks both directions agree', () => {
    // top <- sponsor <- kid is two edges.
    assert.match(out.files['private/sponsors.csv'], /"kid@example.com","sponsor@example.com"/);
    assert.match(out.files['private/sponsors.csv'], /"sponsor@example.com","top@example.com"/);
    assert.equal(out.report.counts.sponsorEdges, 2);
    assert.equal(out.report.checks.asymmetricReferralLinks, 0);
  });

  it('writes the rate timeline', () => {
    assert.equal(out.rates.changes.length, 1);
    assert.equal(out.rates.changes[0].from, 40);
    assert.equal(out.rates.changes[0].to, 20);
  });

  it('keeps every email, wallet and internal id out of the shareable files', () => {
    const shareable = Object.entries(out.files).filter(([name]) => name.startsWith('shareable/') || name === 'rates.json');
    assert.ok(shareable.length >= 5);
    for (const [name, content] of shareable) {
      assert.doesNotMatch(content, /@example\.com/, `${name} leaks an email`);
      assert.doesNotMatch(content, new RegExp(WALLET), `${name} leaks a wallet`);
      assert.doesNotMatch(content, /cexample0000000000000001/, `${name} leaks an internal id`);
    }
    // The aliasing is stable, so the tree still reads across files.
    assert.match(out.files['shareable/sponsors.csv'], /"member-\d+","member-\d+"/);
  });

  it('keeps real data in the private files', () => {
    assert.match(out.files['private/members.csv'], /sponsor@example\.com/);
    assert.match(out.files['private/members.csv'], new RegExp(WALLET));
  });
});
