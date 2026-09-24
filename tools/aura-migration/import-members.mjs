// AURA RUN → ALLI member importer (dry-run / review tool).
//
// Reads members.csv (produced by export-members.mjs), normalizes it to ALLI's
// user model, and writes reviewable artifacts. It does NOT connect to or write
// to any database: it produces a normalized JSON and an idempotent seed SQL for
// a human to review and apply deliberately. Balances (ALLI/USDT) are reported
// but never auto-seeded — they belong in the star/redemption ledgers, which is
// a product decision, not a straight column copy.
//
// Usage:
//   node import-members.mjs [--in members.csv] [--out-json members.normalized.json] [--out-sql members.seed.sql]
//
// Mapping to server/migrations schema (users table):
//   email        -> users.email        (lowercased; unique on lower(email))
//   tier         -> users.shoe_tier    (leather | silver | gold)
//   status       -> users.disabled_at  (ACTIVE => NULL, else set to now())
//   registered   -> users.created_at   (DD/MM/YYYY => ISO date)

import { readFileSync, writeFileSync } from 'node:fs';

const args = parseArgs(process.argv.slice(2));
const inPath = args.in ?? './members.csv';
const outJson = args['out-json'] ?? './members.normalized.json';
const outSql = args['out-sql'] ?? './members.seed.sql';

const TIER_MAP = { leather: 'leather', silver: 'silver', gold: 'gold' };
const VALID_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const rows = parseCsv(readFileSync(inPath, 'utf8'));
if (!rows.length) {
  console.error(`No rows found in ${inPath}. Run export-members.mjs first.`);
  process.exit(1);
}

const byEmail = new Map();
const problems = [];
const balances = [];
let duplicates = 0;

for (const [i, raw] of rows.entries()) {
  const line = i + 2; // +1 for header, +1 for 1-based
  const email = (raw.email ?? '').trim().toLowerCase();
  if (!VALID_EMAIL.test(email)) {
    problems.push({ line, email: raw.email, issue: 'invalid or missing email' });
    continue;
  }

  const tier = TIER_MAP[(raw.tier ?? '').trim().toLowerCase()];
  if (!tier) problems.push({ line, email, issue: `unrecognised tier "${raw.tier}" (defaulted to leather)` });

  // The Playwright exporter emits `registered_at`; the console exporter keeps
  // the panel's own "Registered" header. Accept either.
  const registered = raw.registered_at || raw.registered;
  const created_at = toIsoDate(registered);
  if (registered && !created_at) {
    problems.push({ line, email, issue: `unparseable date "${registered}"` });
  }

  const active = (raw.status ?? '').trim().toLowerCase() === 'active' || !raw.status;

  const alli = toNumber(raw.alli);
  const usdt = toNumber(raw.usdt);
  if (alli || usdt) balances.push({ email, alli, usdt });

  const record = { email, shoe_tier: tier ?? 'leather', created_at, active };

  if (byEmail.has(email)) {
    duplicates += 1;
    // Keep the earliest registration; prefer the higher tier; active wins.
    const prev = byEmail.get(email);
    byEmail.set(email, mergeDuplicate(prev, record));
  } else {
    byEmail.set(email, record);
  }
}

const members = [...byEmail.values()];

writeFileSync(outJson, JSON.stringify(members, null, 2) + '\n');
writeFileSync(outSql, toSeedSql(members));

// ── summary ──
const tierCounts = tally(members.map((m) => m.shoe_tier));
const activeCount = members.filter((m) => m.active).length;
const dates = members.map((m) => m.created_at).filter(Boolean).sort();
const totalAlli = balances.reduce((s, b) => s + b.alli, 0);
const totalUsdt = balances.reduce((s, b) => s + b.usdt, 0);

console.warn('\n── AURA RUN member import (dry run) ──');
console.warn(`Input rows        : ${rows.length}`);
console.warn(`Unique members    : ${members.length}  (deduped ${duplicates})`);
console.warn(`By tier           : ${JSON.stringify(tierCounts)}`);
console.warn(`Active            : ${activeCount} / ${members.length}`);
console.warn(`Registered range  : ${dates[0] ?? '?'} … ${dates[dates.length - 1] ?? '?'}`);
console.warn(`Rows with balances: ${balances.length}  (Σ ALLI ${totalAlli}, Σ USDT ${totalUsdt})`);
console.warn(`Data issues       : ${problems.length}`);
for (const p of problems.slice(0, 20)) console.warn(`  line ${p.line}: ${p.issue}`);
if (problems.length > 20) console.warn(`  … and ${problems.length - 20} more`);
console.warn(`\nWrote ${outJson} and ${outSql} (both PII — gitignored). No database was touched.`);
console.warn('Balances are reported only; seeding them into the star/redemption ledgers is a');
console.warn('separate, deliberate step once the token/ledger mapping is decided.\n');

// ── helpers ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      out[key] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
    }
  }
  return out;
}

// Minimal RFC-4180-ish CSV parser: quoted fields, doubled quotes, embedded commas.
function parseCsv(text) {
  const records = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i += 1;
      row.push(field); field = '';
      if (row.some((v) => v !== '')) records.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); if (row.some((v) => v !== '')) records.push(row); }
  if (!records.length) return [];
  const header = records[0].map((h) => h.trim().toLowerCase());
  return records.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

function toIsoDate(s) {
  if (!s) return null;
  const t = s.trim();
  // DD/MM/YYYY (the panel's format).
  let m = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // YYYY-MM-DD passthrough.
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
}

function toNumber(s) {
  if (!s) return 0;
  const n = Number(String(s).replace(/[, ]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function mergeDuplicate(a, b) {
  const rank = { leather: 0, silver: 1, gold: 2 };
  const dates = [a.created_at, b.created_at].filter(Boolean).sort();
  return {
    email: a.email,
    shoe_tier: rank[b.shoe_tier] > rank[a.shoe_tier] ? b.shoe_tier : a.shoe_tier,
    created_at: dates[0] ?? null,
    active: a.active || b.active,
  };
}

function tally(xs) {
  const out = {};
  for (const x of xs) out[x] = (out[x] ?? 0) + 1;
  return out;
}

function toSeedSql(members) {
  const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
  const lines = [
    '-- AURA RUN member seed for ALLI (review before applying).',
    '-- Idempotent: upserts by lower(email), matching the users_email_key index.',
    '-- Does NOT touch balances/ledgers.',
    'BEGIN;',
  ];
  for (const m of members) {
    const created = m.created_at ? q(m.created_at) : 'now()';
    const disabled = m.active ? 'NULL' : 'now()';
    lines.push(
      `INSERT INTO users (email, shoe_tier, created_at, disabled_at) ` +
        `VALUES (${q(m.email)}, ${q(m.shoe_tier)}, ${created}, ${disabled}) ` +
        `ON CONFLICT (lower(email)) DO UPDATE SET shoe_tier = EXCLUDED.shoe_tier;`,
    );
  }
  lines.push('COMMIT;', '');
  return lines.join('\n');
}
