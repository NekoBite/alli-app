#!/usr/bin/env node
// Does ALLI pay commissions the way the old AURA RUN system did? Run this on a crawl.
//
//   node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON verify-commissions.mjs [--dir ./capture]
//
// It reads what crawl-admin.mjs wrote (the Commissions ledger, and every member's profile with their
// sponsor and upgrades), replays every historical upgrade through ALLI's production `splitCommission`
// and the alternatives a 4-level plan could use, and reports which one reproduces the old payouts.
// See lib/verify.mjs for exactly what it can and cannot tell apart.
//
// The console summary has numbers and verdicts only, never an email, so it is safe to paste.
// Detail goes to files:  private/verify-*  (real emails, for you)  and  shareable/verify-*  (aliased).
//
// Flags:
//   --dir <dir>      the crawl folder (default ./capture)
//   --max-gen <n>    paying generations (default: the highest Gen seen in the ledger)
//   --window <s>     seconds after an upgrade in which its commissions are booked (default 5)

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { verify } from './lib/verify.mjs';

const { values: args } = parseArgs({
  options: {
    dir: { type: 'string', default: './capture' },
    'max-gen': { type: 'string' },
    window: { type: 'string', default: '5' },
    help: { type: 'boolean', default: false },
  },
});
if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const dir = resolve(args.dir);
const membersPath = join(dir, 'private', 'members.json');
const commissionsPath = join(dir, 'commissions.json');
for (const [what, path] of [['member profiles', membersPath], ['the commission ledger', commissionsPath]]) {
  if (!existsSync(path)) {
    console.error(`Cannot find ${what} at ${path}.\nRun the crawler first (npm run crawl), or rebuild the outputs with:  node crawl-admin.mjs --only consolidate`);
    process.exit(1);
  }
}

const members = JSON.parse(readFileSync(membersPath, 'utf8'));
const all = JSON.parse(readFileSync(commissionsPath, 'utf8'));
if (all.length === 0) {
  console.error('The commission ledger is empty, so there is nothing to verify.');
  process.exit(1);
}

// Only credited rows are payouts. Anything else (pending, void...) is counted and set aside.
const statusCounts = {};
for (const r of all) statusCounts[r.status || '(none)'] = (statusCounts[r.status || '(none)'] ?? 0) + 1;
const commissions = all.filter((r) => !r.status || r.status === 'CREDITED');

const report = verify({ members, commissions }, { maxGen: args['max-gen'] ? Number(args['max-gen']) : undefined, window: Number(args.window) });
const withContext = {
  generatedAt: new Date().toISOString(),
  ledger: { rows: all.length, creditedRows: commissions.length, statusCounts },
  members: { total: members.length, withProfile: members.filter((m) => m.profile).length },
  ...report,
};

// ── files ───────────────────────────────────────────────────────────────────────────────────
const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
const names = report.variants.map((v) => v.name);
const eventsCsv = (alias) =>
  [
    ['buyer', 'at', 'base', 'upgrade_number', 'sponsors_known', 'paid_by_depth', 'actual_payouts', 'distinguishes_rules', ...names].join(','),
    ...report.eventLines.map((e) =>
      [alias(e.buyer), e.at, e.amount, e.ordinal, e.depthKnown, e.paid, JSON.stringify(Object.fromEntries(Object.entries(e.actual).map(([k, v]) => [k.replace(/^(\S+)/, (m) => alias(m)), v]))), e.discriminating, ...names.map((n) => (n in e.candidates ? e.candidates[n] : ''))].map(csvCell).join(','),
    ),
  ].join('\n') + '\n';

const aliases = new Map();
const alias = (email) => {
  if (!email) return email;
  const key = String(email).toLowerCase();
  if (!aliases.has(key)) aliases.set(key, `member-${aliases.size + 1}`);
  return aliases.get(key);
};
const EMAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const aliasText = (text) => text.replace(EMAIL_G, (e) => alias(e));
const { eventLines, ...summary } = withContext;
const json = JSON.stringify({ ...summary, events: { ...summary.events } }, null, 2);

const write = (path, content) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
};
write(join(dir, 'private', 'verify-report.json'), json);
write(join(dir, 'private', 'verify-events.csv'), eventsCsv((e) => e));
write(join(dir, 'shareable', 'verify-report.json'), aliasText(json));
write(join(dir, 'shareable', 'verify-events.csv'), aliasText(eventsCsv(alias)));

// ── console: numbers and verdicts only ──────────────────────────────────────────────────────
const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : 'n/a');
const e = report.events;
const s = report.structure;
console.log('\n=== COMMISSION DISTRIBUTION: ALLI vs THE OLD SYSTEM ===\n');
console.log(`Ledger        ${all.length} rows (${commissions.length} credited; statuses: ${JSON.stringify(statusCounts)})`);
console.log(`Upgrades      ${e.total} events: ${e.withUpgradeRecord} from member profiles, ${e.ledgerOnly} from the ledger alone, ${e.noSponsor} by members with no sponsor`);
console.log(`Rows/upgrade  ${JSON.stringify(e.rowsPerEvent)}\n`);

console.log('1. WHICH DISTRIBUTION RULE');
console.log(`   By amount and Gen label: ${report.verdict.status.toUpperCase()}. ${report.verdict.text}`);
if (report.verdictByAmount.status !== report.verdict.status || report.verdictByAmount.rule !== report.verdict.rule) {
  console.log(`   By amount alone:         ${report.verdictByAmount.status.toUpperCase()}. ${report.verdictByAmount.text}`);
}
console.log(`   Upgrades that tell the rules apart: ${e.discriminating} (by label) / ${e.discriminatingByAmount} (by amount)`);
for (const v of report.variants) console.log(`   ${v.name.padEnd(11)} reproduces ${v.matched}/${v.evaluated} upgrades exactly (${pct(v.matched, v.evaluated)}), ${v.matchedAmounts} by amount`);

console.log('\n2. THE GEN LABEL AGAINST THE REAL DEPTH (needs no assumption about who qualified)');
console.log(`   label = depth: ${s.labelEqualsDepth}   label below depth: ${s.labelBelowDepth} (compression or roll-up)   label above depth: ${s.labelAboveDepth} (should be 0)`);
console.log(`   paid to someone not above the buyer: ${s.beneficiaryNotInUpline}   to a treasury-like account: ${s.treasuryRows}`);

console.log('\n3. WHO WAS PAID, BY DEPTH, AGAINST WHAT THEIR TIER SAYS');
console.log('   depth  Silver+&paid  Silver+&NOT paid  Leather&paid  Leather&NOT paid');
for (const [depth, c] of Object.entries(report.qualification.byDepth)) {
  console.log(`   Gen ${depth}  ${String(c.tierQualifiedPaid).padStart(12)}  ${String(c.tierQualifiedAbsent).padStart(16)}  ${String(c.tierUnqualifiedPaid).padStart(12)}  ${String(c.tierUnqualifiedAbsent).padStart(16)}`);
}
console.log('   "Silver+ and NOT paid" is the lapsed-membership signal; "Leather and paid" means tier is not the whole gate.');

console.log('\n4. WHAT TRIGGERS A COMMISSION (upgrades that had a sponsor above them)');
for (const [key, v] of Object.entries(e.byAmountAndOrdinal)) console.log(`   ${key.padEnd(12)} ${v.events} upgrades, ${v.withCommission} paid commissions (${pct(v.withCommission, v.events)})`);
const types = Object.entries(report.transactionTypes);
if (types.length) {
  console.log('   Transaction types, and how often a commission followed within seconds (profiles show only the latest 15):');
  for (const [type, v] of types) console.log(`   ${type.padEnd(18)} seen ${v.seen}, followed by a commission ${v.followedByCommission}`);
}

console.log('\n5. ARITHMETIC');
console.log(`   ${report.amounts.rowsOff} of ${report.amounts.rowsChecked} payouts differ from base x percent.`);

console.log(`\nDetail (real emails): ${join(dir, 'private', 'verify-report.json')} and verify-events.csv`);
console.log(`Safe to share (aliased): ${join(dir, 'shareable', 'verify-report.json')} and verify-events.csv\n`);
