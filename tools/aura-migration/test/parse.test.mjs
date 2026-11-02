import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  COMMISSION_COLUMNS,
  commissionFromCells,
  mapColumns,
  parseAdminDate,
  parseAmount,
  parseMemberDetail,
  parsePager,
} from '../lib/parse.mjs';
import { profile } from './fixtures.mjs';

describe('parseAmount', () => {
  it('reads separators, signs and symbols', () => {
    assert.equal(parseAmount('1,234.0045'), 1234.0045);
    assert.equal(parseAmount('+2.5'), 2.5);
    assert.equal(parseAmount('−25'), -25); // the panel prints a real minus sign
    assert.equal(parseAmount('5,000,000 ALLI'), 5000000);
    assert.equal(parseAmount('10%'), 10);
    assert.equal(parseAmount('—'), null);
    assert.equal(parseAmount(null), null);
  });
});

describe('parseAdminDate', () => {
  it('reads day-first dates and keeps the wall-clock time with no zone', () => {
    assert.equal(parseAdminDate('01/11/2026, 14:28:14'), '2026-11-01T14:28:14');
    assert.equal(parseAdminDate('31/10/2026'), '2026-10-31');
    assert.equal(parseAdminDate('CONFIRMED · 26/10/2026, 08:36:18'), '2026-10-26T08:36:18');
    assert.equal(parseAdminDate('not a date'), null);
  });
});

describe('parsePager', () => {
  it('reads both indicators the panel prints', () => {
    assert.deepEqual(parsePager('Showing 1–50 of 3,177 records   Page 1 of 64   Next'), {
      page: 1, pages: 64, from: 1, to: 50, total: 3177,
    });
    assert.equal(parsePager('nothing here').page, null);
  });
});

describe('commission rows', () => {
  it('maps headers and types a row', () => {
    const cols = mapColumns(
      ['Date', 'Beneficiary (upline)', 'Source (downline)', 'Gen', '%', 'Amount (USDT)', 'Status'],
      COMMISSION_COLUMNS,
    );
    assert.deepEqual(cols, { date: 0, beneficiary: 1, source: 2, generation: 3, percent: 4, amount: 5, status: 6 });
    const row = commissionFromCells(
      ['01/11/2026, 14:28:14', 'Jet@Example.com', 'wo@example.com', 'Gen 1', '20%', '5', 'CREDITED'],
      cols,
    );
    assert.deepEqual(row, {
      at: '2026-11-01T14:28:14',
      atRaw: '01/11/2026, 14:28:14',
      beneficiary: 'jet@example.com',
      source: 'wo@example.com',
      generation: 1,
      percent: 20,
      amount: 5,
      status: 'CREDITED',
    });
  });
});

describe('parseMemberDetail', () => {
  it('parses a full profile', () => {
    const p = parseMemberDetail(profile());
    assert.equal(p.ok, true);
    assert.deepEqual(p.warnings, []);
    // The sidebar's admin address must not be taken for the member.
    assert.equal(p.email, 'sponsor@example.com');
    assert.equal(p.id, 'cexample0000000000000001');
    assert.equal(p.tier, 'GOLD');
    assert.equal(p.status, 'ACTIVE');
    assert.equal(p.verified, true);
    assert.equal(p.alli, 100000);
    assert.equal(p.usdt, 5);
    assert.deepEqual(p.referralEarned, { amount: 35, symbol: 'USDT', commissionCount: 5 });
    assert.deepEqual(p.quests, { done: 1, stars: 0 });
    assert.equal(p.registered, '2026-10-02T13:45:10');
    assert.equal(p.nftShoe, 'GOLD');
    assert.equal(p.referredBy, 'top@example.com');
    assert.equal(p.walletTruncated, true);
    assert.equal(p.directReferralsCount, 9);
    assert.deepEqual(p.directReferrals, [
      { genLabel: 'Gen 1', email: 'a1@example.com', tier: 'SILVER', commission: 'paid' },
      { genLabel: 'Gen 2', email: 'b2@example.com', tier: 'LEATHER', commission: 'none' },
    ]);
    assert.deepEqual(p.commissionsEarned, [
      { email: 'a1@example.com', amount: 5, symbol: 'USDT' },
      { email: 'a2@example.com', amount: 5, symbol: 'USDT' },
      { email: 'a3@example.com', amount: 5, symbol: 'USDT' },
      { email: 'a4@example.com', amount: 10, symbol: 'USDT' },
      { email: 'a5@example.com', amount: 10, symbol: 'USDT' },
    ]);
    assert.deepEqual(p.withdrawals, [
      { amount: 25, symbol: 'USDT', status: 'COMPLETED' },
      { amount: 5000000, symbol: 'ALLI', status: 'COMPLETED' },
    ]);
    assert.deepEqual(p.upgrades, [{ amount: 25, symbol: 'USDT', status: 'CONFIRMED', at: '2026-10-26T08:36:18' }]);
    assert.deepEqual(p.transactions, [
      { at: '2026-11-01T13:46:58', type: 'COMMISSION', currency: 'USDT', amount: 5, balance: 5 },
      { at: '2026-11-01T13:46:24', type: 'WITHDRAWAL', currency: 'USDT', amount: -25, balance: 0 },
      { at: '2026-10-27T07:10:45', type: 'DEPOSIT', currency: 'ALLI', amount: 100000, balance: 100000 },
    ]);
    assert.deepEqual(p.truncated, { commissions: false, transactions: false });
  });

  it('keeps a root account with no sponsor, and a full wallet address', () => {
    const wallet = `0x${'ab'.repeat(20)}`;
    const p = parseMemberDetail(profile({ referredBy: '—', wallet }));
    assert.equal(p.referredBy, null);
    assert.equal(p.wallet, wallet);
    assert.equal(p.walletTruncated, false);
  });

  it('copes with amounts split across text nodes', () => {
    const p = parseMemberDetail(
      profile({
        earned: ['944.67', 'USDT', '365', 'commission(s)'],
        commissions: ['a1@example.com', '+2.5', 'USDT'],
        withdrawals: ['10', 'USDT', 'COMPLETED'],
        upgrades: ['25', 'USDT', 'CONFIRMED', '·', '26/10/2026, 08:36:18'],
      }),
    );
    assert.deepEqual(p.referralEarned, { amount: 944.67, symbol: 'USDT', commissionCount: 365 });
    assert.deepEqual(p.commissionsEarned, [{ email: 'a1@example.com', amount: 2.5, symbol: 'USDT' }]);
    assert.deepEqual(p.withdrawals, [{ amount: 10, symbol: 'USDT', status: 'COMPLETED' }]);
    assert.equal(p.upgrades[0].amount, 25);
    assert.equal(p.upgrades[0].at, '2026-10-26T08:36:18');
  });

  it('reads the star count when the quest tile has a large count', () => {
    const p = parseMemberDetail(profile({ quests: ['83', '166', '⭐', 'Stars earned'] }));
    assert.deepEqual(p.quests, { done: 83, stars: 166 });
  });

  it('parses several upgrades and empty sections', () => {
    const many = parseMemberDetail(
      profile({ upgrades: ['25 USDT', 'CONFIRMED · 26/10/2026, 08:36:18', '75 USDT', 'CONFIRMED · 02/11/2026, 09:00:00'] }),
    );
    assert.equal(many.upgrades.length, 2);
    assert.equal(many.upgrades[1].amount, 75);

    const empty = parseMemberDetail(
      profile({ referrals: ['No referrals yet.'], commissions: ['None yet.'], withdrawals: ['No withdrawals.'], upgrades: [], transactions: [] }),
    );
    assert.deepEqual(empty.directReferrals, []);
    assert.deepEqual(empty.commissionsEarned, []);
    assert.deepEqual(empty.withdrawals, []);
    assert.deepEqual(empty.upgrades, []);
  });

  it('flags a profile where the panel capped the lists', () => {
    const transactions = Array.from({ length: 15 }, (_, i) => [`01/11/2026, 10:${String(i).padStart(2, '0')}:00`, 'COMMISSION', 'USDT', '+2.5', String(i)]).flat();
    const p = parseMemberDetail(profile({ earned: ['944.67', 'USDT', '365 commission(s)'], transactions }));
    assert.deepEqual(p.truncated, { commissions: true, transactions: true });
  });

  it('warns, rather than throws, when the layout is not a profile', () => {
    const p = parseMemberDetail(['Dashboard', 'Members', 'Commissions']);
    assert.equal(p.ok, false);
    assert.match(p.warnings[0], /not a member profile/);
  });

  it('reports each label it could not find', () => {
    const tokens = profile().filter((x) => x !== 'Recent transactions');
    const p = parseMemberDetail(tokens);
    assert.ok(p.warnings.some((w) => /Recent transactions/.test(w)));
  });
});

describe('parseDashboard', () => {
  it('reads label-above and value-above tiles', async () => {
    const { parseDashboard } = await import('../lib/parse.mjs');
    const v = parseDashboard([
      'Total Members', '1,000', 'Tiers (L/S/G)', '600 / 350 / 50', 'Pending Withdrawals', '0', 'Confirmed Upgrades', '400',
      'Revenue (USDT)', '2,000', 'upgrades 2,000 · fees 0', 'Commission paid (USDT)', '900', '120 payouts', 'Net profit (USDT)', '+100',
      'Stars awarded', '500', 'Withdrawals (paid out)', '5,000.5', 'USDT (50)', '100,000,000', 'ALLI (60)', '0', 'pending',
      'Activity', '10', 'new users', '5', 'upgrades', '300', 'quests', '700', 'sweeps',
      'Gas (BNB)', '0.1', 'Hot USDT', '10.5', 'Hot ALLI', '5,000,000.25', 'Treasury ALLI', '1,000,000,000',
    ]);
    assert.equal(v.totalMembers, '1,000');
    assert.equal(v.commissionPaidUsdt, '900');
    assert.equal(v.withdrawnUsdt, '5,000.5');
    assert.equal(v.withdrawnAlli, '100,000,000');
    assert.equal(v.newUsers, '10');
    assert.equal(v.upgradesInPeriod, '5');
    assert.equal(v.sweeps, '700');
    assert.equal(v.treasuryAlli, '1,000,000,000');
  });
});
