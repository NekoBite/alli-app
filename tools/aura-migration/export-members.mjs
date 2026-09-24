// AURA RUN member export — run by an authorized operator on their own machine.
//
// Purpose: pull the member list (email, tier, registration date) out of the
// AURA RUN admin panel's Members tab into members.csv, so it can be imported
// into ALLI. AURA RUN's former vendor will not provide a data export, and this
// list is the migrating business's own member data.
//
// Design principle: YOU are the operator. This script never receives, stores,
// or types your credentials. It opens a real browser, you log in and open the
// Members tab yourself, and then it reads the table you are already looking at.
// Only run it against an account you are authorized to use.
//
// Usage:
//   cd tools/aura-migration
//   npm install                 # installs playwright locally
//   npx playwright install chromium
//   node export-members.mjs --url https://admin-aurarun.lnw.dev/
//
// Optional flags (only if auto-detection needs help — see the debug artifacts):
//   --table   <css>   CSS selector for the members <table> (default: auto-detect)
//   --next    <css>   CSS selector for the pagination "next page" control
//   --email   <name>  header text that marks the email column   (default heuristic)
//   --tier    <name>  header text that marks the tier column     (default heuristic)
//   --date    <name>  header text that marks the reg-date column (default heuristic)
//   --out     <path>  output CSV path (default: ./members.csv)
//   --max-pages <n>   safety cap on pages to walk (default: 500)

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const args = parseArgs(process.argv.slice(2));
const baseUrl = args.url ?? 'https://admin-aurarun.lnw.dev/';
const outPath = args.out ?? './members.csv';
const maxPages = Number(args['max-pages'] ?? 500);

// Header-matching heuristics. The panel's real column labels are unknown from
// here, so we match on a set of likely names (English + Thai) and let the
// operator override with --email/--tier/--date once they see the debug output.
const HEURISTICS = {
  email: [args.email, 'email', 'e-mail', 'อีเมล'].filter(Boolean),
  tier: [args.tier, 'tier', 'level', 'shoe', 'rank', 'ระดับ'].filter(Boolean),
  date: [args.date, 'registered', 'register', 'joined', 'created', 'signup', 'sign up', 'วันที่สมัคร', 'สมัคร'].filter(Boolean),
};

const rl = createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();
await page.goto(baseUrl, { waitUntil: 'domcontentloaded' }).catch(() => {});

console.log('\n──────────────────────────────────────────────────────────────');
console.log('  A browser window has opened.');
console.log('  1. Log in with your own credentials.');
console.log('  2. Navigate to the MEMBERS tab so the member table is visible.');
console.log('  3. Come back here and press Enter to start the export.');
console.log('──────────────────────────────────────────────────────────────\n');
await ask('Press Enter when the Members table is on screen... ');

// Save debug artifacts so the operator can verify / fix selectors.
await page.screenshot({ path: './members-page.png', fullPage: true }).catch(() => {});

const table = await locateTable(page, args.table);
if (!table) {
  console.error(
    '\nCould not find a members table automatically.\n' +
      'Open members-page.png, find the table, and re-run with:\n' +
      '  --table "<css selector for the <table>>"\n' +
      'Optionally --email/--tier/--date "<header label>" if columns are mislabelled.\n',
  );
  await browser.close();
  rl.close();
  process.exit(1);
}

const headers = await table.locator('thead th, thead td').allInnerTexts();
const cols = resolveColumns(headers);
console.log('\nDetected headers:', headers.map((h, i) => `[${i}] ${h.trim()}`).join('  '));
console.log('Column mapping   :', cols, '\n');

if (cols.email < 0) {
  console.error(
    'Could not identify the EMAIL column from the headers above.\n' +
      'Re-run with --email "<the exact email header label>".\n',
  );
  await browser.close();
  rl.close();
  process.exit(1);
}

const seen = new Set();
const rows = [];
let pageNum = 0;

while (pageNum < maxPages) {
  pageNum += 1;
  const pageRows = await readRows(table, cols);
  let added = 0;
  for (const r of pageRows) {
    const key = r.email.toLowerCase();
    if (!r.email || seen.has(key)) continue;
    seen.add(key);
    rows.push(r);
    added += 1;
  }
  console.log(`Page ${pageNum}: +${added} members (total ${rows.length})`);

  const advanced = await goNext(page, args.next);
  if (!advanced) break;
  // Let the next page render. A short wait is enough for client-side tables;
  // server-rendered ones already navigated.
  await page.waitForTimeout(600);
}

writeFileSync(outPath, toCsv(rows));
console.log(`\nDone. ${rows.length} members written to ${outPath}`);
console.log('Debug screenshot: members-page.png');
await browser.close();
rl.close();

// ── helpers ──────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
      out[key] = val;
    }
  }
  return out;
}

async function locateTable(page, override) {
  if (override) {
    const t = page.locator(override).first();
    return (await t.count()) ? t : null;
  }
  // Prefer the table with the most rows — the members list, not a nav/summary table.
  const tables = page.locator('table');
  const n = await tables.count();
  let best = null;
  let bestRows = 0;
  for (let i = 0; i < n; i += 1) {
    const t = tables.nth(i);
    const r = await t.locator('tbody tr').count();
    if (r > bestRows) {
      bestRows = r;
      best = t;
    }
  }
  return bestRows > 0 ? best : null;
}

function resolveColumns(headers) {
  const norm = headers.map((h) => h.trim().toLowerCase());
  const find = (names) =>
    norm.findIndex((h) => names.some((name) => h.includes(String(name).toLowerCase())));
  return { email: find(HEURISTICS.email), tier: find(HEURISTICS.tier), date: find(HEURISTICS.date) };
}

async function readRows(table, cols) {
  const trs = table.locator('tbody tr');
  const count = await trs.count();
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const cells = await trs.nth(i).locator('td').allInnerTexts();
    if (!cells.length) continue;
    out.push({
      email: (cells[cols.email] ?? '').trim(),
      tier: cols.tier >= 0 ? (cells[cols.tier] ?? '').trim() : '',
      registered_at: cols.date >= 0 ? (cells[cols.date] ?? '').trim() : '',
    });
  }
  return out;
}

async function goNext(page, override) {
  // Explicit selector wins.
  if (override) {
    const btn = page.locator(override).first();
    if ((await btn.count()) && (await btn.isEnabled().catch(() => false))) {
      await btn.click().catch(() => {});
      return true;
    }
    return false;
  }
  // Try common "next page" affordances. A disabled/absent control ends the walk.
  const candidates = [
    'button[aria-label*="next" i]',
    'a[aria-label*="next" i]',
    'button:has-text("Next")',
    'a:has-text("Next")',
    'li.next:not(.disabled) a',
    'button[rel="next"]',
    '[class*="pagination"] [class*="next"]:not([disabled])',
  ];
  for (const sel of candidates) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    const disabled =
      (await btn.getAttribute('disabled')) !== null ||
      (await btn.getAttribute('aria-disabled')) === 'true' ||
      !(await btn.isEnabled().catch(() => false));
    if (disabled) continue;
    await btn.click().catch(() => {});
    return true;
  }
  return false;
}

function toCsv(rows) {
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = 'email,tier,registered_at';
  const body = rows.map((r) => [r.email, r.tier, r.registered_at].map(esc).join(','));
  return [head, ...body].join('\n') + '\n';
}
