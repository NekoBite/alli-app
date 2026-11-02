#!/usr/bin/env node
// AURA RUN admin crawler — run by an authorised operator, on their own machine.
//
// Collects, read-only, what the migration needs from the old admin panel:
//   dashboard      the totals, for reconciliation
//   members        the Members list (every page)
//   commissions    the whole Commissions ledger (every page)
//   details        every member's profile page: sponsor, wallet, balances, referrals,
//                  withdrawals, upgrades, recent transactions
// then writes the combined files (see lib/consolidate.mjs).
//
// Principles, the same as the other tools in this folder:
//   * YOU are the operator. A real browser window opens, you log in yourself, and the script
//     never sees, stores or types a credential.
//   * Read-only, enforced twice. The script only ever navigates and clicks "Next"; it never
//     touches the profile page's Activate / Suspend / Ban / Save controls. On top of that, once
//     you confirm you are logged in, the browser refuses to send any request that is not a GET,
//     so even a stray click could not change anything. Anything it refuses is listed in the report.
//   * Gentle. One page at a time with a pause between pages (--delay).
//   * Resumable. Each profile is saved as it is read; re-running skips what is already on disk.
//
// Setup (once):
//   cd tools/aura-migration && npm install && npx playwright install chromium
//
// Usage:
//   node crawl-admin.mjs --probe                 first: 1 page of each list and 3 profiles, printed
//   node crawl-admin.mjs                         the full crawl
//   node crawl-admin.mjs --only consolidate      rebuild the outputs from what is on disk, no browser
//
// Flags:
//   --url <base>          admin site (default https://admin-aurarun.lnw.dev/)
//   --out <dir>           where everything is written (default ./capture, which is git-ignored)
//   --only <a,b,c>        phases: dashboard, members, commissions, details, consolidate
//   --delay <ms>          pause between profile pages (default 700)
//   --limit <n>           only the first n profiles
//   --max-pages <n>       safety cap on pages walked per list (default 200)
//   --force               fetch profiles again even if already on disk
//   --allow-write <regex> let matching non-GET requests through (repeatable). Needed only if the
//                         panel reads data with POST; the report lists what was refused.
//   --headless --yes      no window and no login prompt. For automated tests only.
//
// Everything written contains personal data. private/ holds real emails and wallets: keep it on
// your machine. shareable/ has every email replaced by an alias and no wallets or ids.

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { parseArgs } from 'node:util';

import { consolidateDir } from './lib/consolidate.mjs';
import { idFromHref, idsFromJson } from './lib/ids.mjs';
import {
  COMMISSION_COLUMNS,
  MEMBER_COLUMNS,
  commissionFromCells,
  mapColumns,
  parseDashboard,
  parseMemberDetail,
  parsePager,
} from './lib/parse.mjs';

const { values: args } = parseArgs({
  options: {
    url: { type: 'string', default: 'https://admin-aurarun.lnw.dev/' },
    out: { type: 'string', default: './capture' },
    only: { type: 'string' },
    delay: { type: 'string', default: '700' },
    limit: { type: 'string' },
    'max-pages': { type: 'string', default: '200' },
    probe: { type: 'boolean', default: false },
    force: { type: 'boolean', default: false },
    headless: { type: 'boolean', default: false },
    yes: { type: 'boolean', default: false },
    'allow-write': { type: 'string', multiple: true },
    executable: { type: 'string' },
    help: { type: 'boolean', default: false },
  },
});

if (args.help) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n'));
  process.exit(0);
}

const PHASES = ['dashboard', 'members', 'commissions', 'details'];
const only = args.only ? args.only.split(',').map((s) => s.trim()) : null;
const wants = (phase) => !only || only.includes(phase);
const outDir = resolve(args.probe ? join(args.out, 'probe') : args.out);
const delay = Number(args.delay);
const maxPages = args.probe ? 1 : Number(args['max-pages']);
const detailLimit = args.probe ? 3 : args.limit ? Number(args.limit) : Infinity;

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`);
const warn = (msg) => console.warn(`[${new Date().toISOString().slice(11, 19)}] WARNING: ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const writeJson = (path, data) => {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
};
const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback);

mkdirSync(outDir, { recursive: true });

// Rebuilding from disk needs no browser, so it must not need Playwright installed either.
if (only && only.length === 1 && only[0] === 'consolidate') {
  const { report } = consolidateDir(outDir);
  console.log(JSON.stringify(report.counts, null, 2));
  log(`Rebuilt the outputs in ${outDir}`);
  process.exit(0);
}

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.error('Playwright is not installed. Run:  npm install && npx playwright install chromium');
  process.exit(1);
}

const base = new URL(args.url.endsWith('/') ? args.url : `${args.url}/`);
const browser = await chromium.launch({ headless: args.headless, executablePath: args.executable });
// No service worker, so the request guard below sees every request the page makes.
const context = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
// A confirm() is a question about doing something. Answer "cancel".
page.on('dialog', (d) => void d.dismiss().catch(() => {}));

let stopping = false;
process.on('SIGINT', () => {
  if (stopping) process.exit(130);
  stopping = true;
  console.log('\nStopping after the current page. Everything saved so far is kept. (Ctrl-C again to quit now.)');
});

// ── what the panel's own API returns ─────────────────────────────────────────────────────────
// Kept alongside the page text: the JSON has exact balances, full wallet addresses and ids that
// the screen abbreviates or hides. Headers are never recorded, so no credential can end up here.
let currentTag = 'startup';
let apiLog = [];
page.on('response', async (res) => {
  try {
    if (!/json/i.test(res.headers()['content-type'] ?? '')) return;
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* keep the text */
    }
    apiLog.push({
      tag: currentTag,
      method: res.request().method(),
      url: res.url(),
      status: res.status(),
      json,
      text: json ? undefined : text.slice(0, 5000),
    });
  } catch {
    /* a response that cannot be read is not worth stopping for */
  }
});
const takeApi = () => {
  const taken = apiLog;
  apiLog = [];
  return taken;
};

// ── helpers that read the page ───────────────────────────────────────────────────────────────
const collectTokens = () =>
  page.evaluate(() => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentElement;
        if (!parent) return NodeFilter.FILTER_REJECT;
        if (['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE'].includes(parent.tagName)) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = n.textContent.replace(/\s+/g, ' ').trim();
      if (text) out.push(text);
    }
    return out;
  });

const bodyText = () => page.evaluate(() => document.body.innerText);

const readTable = () =>
  page.evaluate(() => {
    const clean = (s) => (s ?? '').replace(/\s+/g, ' ').trim();
    const tables = [...document.querySelectorAll('table')].sort(
      (a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length,
    );
    const table = tables[0];
    const bodyText = document.body.innerText;
    if (!table) return { headers: [], rows: [], bodyText, found: false };
    return {
      found: true,
      bodyText,
      headers: [...table.querySelectorAll('thead th, thead td')].map((c) => clean(c.innerText)),
      rows: [...table.querySelectorAll('tbody tr')]
        .map((tr) => ({
          cells: [...tr.querySelectorAll('td')].map((td) => clean(td.innerText)),
          links: [...tr.querySelectorAll('a[href]')].map((a) => ({ text: clean(a.innerText), href: a.getAttribute('href') })),
        }))
        .filter((r) => r.cells.length > 0),
    };
  });

/** Marks the enabled "Next" control, if any, and clicks it. The only thing this script clicks. */
async function clickNext() {
  const marked = await page.evaluate(() => {
    document.querySelectorAll('[data-crawl-next]').forEach((e) => e.removeAttribute('data-crawl-next'));
    const el = [...document.querySelectorAll('button, a, [role="button"]')].find((e) => {
      const label = `${e.innerText || ''} ${e.getAttribute('aria-label') || ''}`;
      return /\bnext\b/i.test(label) && !e.disabled && e.getAttribute('aria-disabled') !== 'true';
    });
    if (!el) return false;
    el.setAttribute('data-crawl-next', '1');
    return true;
  });
  if (!marked) return false;
  await page.click('[data-crawl-next="1"]', { timeout: 5000 });
  return true;
}

async function waitForTable() {
  const until = Date.now() + 20_000;
  let last = null;
  while (Date.now() < until) {
    last = await readTable();
    if (last.rows.length > 0) return last;
    await sleep(250);
  }
  return last;
}

// ── knowing which ids belong to which email ─────────────────────────────────────────────────
const idByEmail = new Map();
const learnIds = (rows, api) => {
  for (const r of rows ?? []) {
    for (const l of r.links) {
      const id = idFromHref(l.href);
      if (id && /@/.test(l.text)) idByEmail.set(l.text.toLowerCase(), id);
    }
  }
  for (const a of api ?? []) if (a.json) idsFromJson(a.json, idByEmail);
};

// ── walking a paginated table ────────────────────────────────────────────────────────────────
async function walkTable(kind, { columnsSpec, toRecord, keyOf }) {
  const records = [];
  const seen = new Set();
  const skipped = [];
  let claimed = null;
  let pagesWalked = 0;

  for (;;) {
    const t = await waitForTable();
    if (!t || !t.found || t.rows.length === 0) {
      warn(`${kind}: no table rows found on this page.`);
      break;
    }
    const cols = mapColumns(t.headers, columnsSpec);
    const pager = parsePager(t.bodyText);
    claimed = pager.total ?? claimed;
    pagesWalked += 1;

    let added = 0;
    for (const row of t.rows) {
      const rec = toRecord(row.cells, cols);
      const key = keyOf(rec);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      records.push(rec);
      added += 1;
    }
    const api = takeApi();
    learnIds(t.rows, api);
    writeJson(join(outDir, 'api', `${kind}-p${pager.page ?? pagesWalked}.json`), api);
    log(`${kind}: page ${pager.page ?? '?'}/${pager.pages ?? '?'} +${added} (total ${records.length}${claimed ? ` of ${claimed}` : ''})`);

    if (stopping || !pager.page || !pager.pages || pager.page >= pager.pages || pagesWalked >= maxPages) break;

    // Turn the page and confirm it by the "Page X of Y" counter, not by the rows changing: an
    // earlier version judged by the first row and silently lost a whole page of twenty members.
    const want = pager.page + 1;
    const firstBefore = t.rows[0]?.cells.join('|');
    currentTag = `${kind}-p${want}`;
    if (!(await clickNext())) {
      warn(`${kind}: no enabled "Next" control on page ${pager.page} of ${pager.pages}.`);
      break;
    }
    let advanced = false;
    for (let i = 0; i < 80 && !advanced; i += 1) {
      await sleep(200);
      const cur = await readTable();
      const p = parsePager(cur.bodyText);
      if (p.page === null) continue;
      if (p.page > want) {
        for (let n = want; n < p.page; n += 1) skipped.push(n);
        advanced = true;
      } else if (p.page === want && (cur.rows[0]?.cells.join('|') !== firstBefore || i >= 15)) {
        advanced = true; // the counter moved, and the rows followed it (or had long enough to)
      }
    }
    if (!advanced) {
      warn(`${kind}: stuck leaving page ${pager.page}; stopping this list.`);
      break;
    }
    await sleep(Math.max(150, delay / 3));
  }

  if (skipped.length) warn(`${kind}: SKIPPED PAGES ${skipped.join(', ')}`);
  if (claimed && records.length < claimed && pagesWalked >= 1 && !args.probe) {
    warn(`${kind}: collected ${records.length} of the ${claimed} the panel claims. Rows arriving during the crawl shift the pages, so a small gap is normal on a live list; a large one is not.`);
  }
  return { records, claimed, skipped, pagesWalked };
}

// ── start: the operator logs in ─────────────────────────────────────────────────────────────
await page.goto(base.toString(), { waitUntil: 'domcontentloaded' }).catch(() => {});
if (!args.yes) {
  console.log('\n──────────────────────────────────────────────────────────────────────────');
  console.log('  A browser window has opened.');
  console.log('  1. Log in yourself. This script never sees or types your credentials.');
  console.log('  2. Wait until the Dashboard is showing.');
  console.log('  3. Come back here and press Enter.');
  console.log('  From then on the browser refuses every request that is not a GET.');
  console.log('──────────────────────────────────────────────────────────────────────────\n');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  await new Promise((r) => rl.question('Press Enter once you are logged in... ', r));
  rl.close();
}

// The read-only guard. Installed only now, because logging in is itself a POST.
const allowWrite = (args['allow-write'] ?? []).map((s) => new RegExp(s));
const blocked = [];
await context.route('**/*', (route) => {
  const req = route.request();
  const method = req.method();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return route.continue();
  if (allowWrite.some((re) => re.test(req.url()))) return route.continue();
  blocked.push({ method, url: req.url() });
  return route.abort('blockedbyclient');
});
log('Read-only guard is on: only GET requests will be sent.');

// ── where things are ─────────────────────────────────────────────────────────────────────────
const nav = await page.$$eval('a[href]', (as) => as.map((a) => ({ text: (a.innerText || '').trim(), href: a.href }))).catch(() => []);
const route = (re, fallback) => nav.find((n) => re.test(n.text))?.href ?? new URL(fallback, base).toString();
const dashboardUrl = route(/^Dashboard$/i, '');
const membersUrl = route(/^Members$/i, 'members');
const commissionsUrl = route(/^Commissions$/i, 'commissions');
log(`Dashboard ${dashboardUrl}  Members ${membersUrl}  Commissions ${commissionsUrl}`);

const startedAt = new Date().toISOString();
const run = { startedAt, base: base.toString(), probe: args.probe, phases: only ?? PHASES, delayMs: delay, notes: [] };

// ── dashboard ────────────────────────────────────────────────────────────────────────────────
if (wants('dashboard') && !stopping) {
  currentTag = 'dashboard';
  takeApi();
  await page.goto(dashboardUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => /Total Members/i.test(document.body.innerText), null, { timeout: 20_000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
  const tokens = await collectTokens();
  const values = parseDashboard(tokens);
  writeJson(join(outDir, 'dashboard.json'), { fetchedAt: new Date().toISOString(), values, tokens, api: takeApi() });
  log(`dashboard: ${values.totalMembers ?? '?'} members, treasury ${values.treasuryAlli ?? '?'} ALLI`);
}

// ── members list ─────────────────────────────────────────────────────────────────────────────
let members = readJson(join(outDir, 'members-list.json'), []);
if (wants('members') && !stopping) {
  currentTag = 'members-p1';
  takeApi();
  await page.goto(membersUrl, { waitUntil: 'domcontentloaded' });
  const walked = await walkTable('members', {
    columnsSpec: MEMBER_COLUMNS,
    toRecord: (cells, cols) => {
      const at = (i) => (i >= 0 ? (cells[i] ?? '').trim() : '');
      return { email: at(cols.email).toLowerCase(), tier: at(cols.tier), status: at(cols.status), registered: at(cols.registered), alli: at(cols.alli), usdt: at(cols.usdt) };
    },
    keyOf: (r) => r.email,
  });
  members = walked.records;
  run.members = { claimed: walked.claimed, collected: members.length, skippedPages: walked.skipped };
}

// ── commissions ledger ───────────────────────────────────────────────────────────────────────
let commissions = readJson(join(outDir, 'commissions.json'), []);
if (wants('commissions') && !stopping) {
  currentTag = 'commissions-p1';
  takeApi();
  await page.goto(commissionsUrl, { waitUntil: 'domcontentloaded' });
  const walked = await walkTable('commissions', {
    columnsSpec: COMMISSION_COLUMNS,
    toRecord: commissionFromCells,
    keyOf: (r) => [r.atRaw, r.beneficiary, r.source, r.generation, r.percent, r.amount].join('|'),
  });
  commissions = walked.records;
  writeJson(join(outDir, 'commissions.json'), commissions);
  run.commissions = { claimed: walked.claimed, collected: commissions.length, skippedPages: walked.skipped };
}
// Ids learned from the lists need to survive into a later run that skips them.
const idsPath = join(outDir, 'ids.json');
for (const [email, id] of Object.entries(readJson(idsPath, {}))) if (!idByEmail.has(email)) idByEmail.set(email, id);
members = members.map((m) => ({ ...m, id: idByEmail.get(m.email) ?? m.id ?? null }));
writeJson(join(outDir, 'members-list.json'), members);
writeJson(idsPath, Object.fromEntries(idByEmail));

// ── every member's profile ───────────────────────────────────────────────────────────────────
if (wants('details') && !stopping) {
  const detailDir = join(outDir, 'details');
  mkdirSync(detailDir, { recursive: true });

  const targets = members.filter((m) => m.id);
  const unresolved = members.filter((m) => !m.id).map((m) => m.email);
  // Anyone who appears in the commission ledger but not in the list is still a member worth reading.
  const known = new Set(members.map((m) => m.email));
  for (const [email, id] of idByEmail) if (!known.has(email)) targets.push({ email, id, fromLedgerOnly: true });
  if (unresolved.length) {
    warn(`${unresolved.length} members have no id yet, so their profile cannot be opened (listed in run.json).`);
    run.notes.push(`${unresolved.length} members without an id`);
  }

  const profileBase = membersUrl.replace(/\/$/, '');
  const probeReport = [];
  let visited = 0;
  let consecutiveFailures = 0;
  const startedVisits = Date.now();
  const todo = targets.filter((m) => args.force || args.probe || !existsSync(join(detailDir, `${m.id}.json`)));
  log(`details: ${todo.length} to fetch (${targets.length - todo.length} already on disk)`);

  for (const m of todo) {
    if (stopping || visited >= detailLimit) break;
    let ok = false;
    for (let attempt = 1; attempt <= 3 && !ok && !stopping; attempt += 1) {
      try {
        currentTag = `member-${m.id}`;
        takeApi();
        await page.goto(`${profileBase}/${m.id}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        if (/\/(login|sign-?in)/i.test(new URL(page.url()).pathname)) {
          console.error('\nThe session has expired: the panel sent the browser back to the login page.');
          console.error('Log in again, then re-run the same command. It resumes where it stopped.');
          stopping = true;
          break;
        }
        await page.waitForFunction(() => /ALLI Balance/i.test(document.body.innerText), null, { timeout: 20_000 });
        await page.waitForLoadState('networkidle', { timeout: 4000 }).catch(() => {});

        const api = takeApi();
        if (api.some((a) => a.status === 401 || a.status === 403)) {
          console.error('\nThe panel answered 401/403: the session was rejected or this account may not see that page.');
          stopping = true;
          break;
        }
        learnIds([], api);
        const tokens = await collectTokens();
        const text = (await bodyText()).slice(0, 200_000);
        const parsed = parseMemberDetail(tokens);
        writeJson(join(detailDir, `${m.id}.json`), { id: m.id, email: m.email, url: page.url(), fetchedAt: new Date().toISOString(), tokens, text, api });
        if (args.probe) probeReport.push({ id: m.id, parsed });
        if (!parsed.ok || parsed.warnings.length) warn(`${m.email}: ${(parsed.warnings ?? []).join('; ')}`);
        ok = true;
      } catch (error) {
        warn(`${m.email} attempt ${attempt}/3: ${String(error.message ?? error).split('\n')[0]}`);
        await sleep(1500 * attempt * attempt);
      }
    }
    if (stopping) break;
    consecutiveFailures = ok ? 0 : consecutiveFailures + 1;
    if (consecutiveFailures >= 3) {
      console.error('\nThree profiles in a row failed. Stopping so nothing is hammered. Check the window, then re-run.');
      break;
    }
    visited += 1;
    if (visited % 25 === 0) {
      const per = (Date.now() - startedVisits) / visited;
      log(`details: ${visited}/${Math.min(todo.length, detailLimit)} · ${(per / 1000).toFixed(1)} s each · about ${Math.round(((Math.min(todo.length, detailLimit) - visited) * per) / 60000)} min left`);
    }
    await sleep(delay + Math.random() * delay * 0.4);
  }
  run.details = { targets: targets.length, fetchedThisRun: visited, unresolvedEmails: unresolved };

  if (args.probe) {
    console.log('\n=== PROBE: what the parser made of the first profiles ===');
    for (const p of probeReport) {
      const d = p.parsed;
      console.log(JSON.stringify(d.ok ? { email: d.email, id: d.id, tier: d.tier, status: d.status, alli: d.alli, usdt: d.usdt, referredBy: d.referredBy, wallet: d.wallet, referralEarned: d.referralEarned, quests: d.quests, directReferrals: `${d.directReferrals.length} of ${d.directReferralsCount}`, commissionsListed: d.commissionsEarned.length, withdrawals: d.withdrawals.length, upgrades: d.upgrades.length, transactions: d.transactions.length, warnings: d.warnings } : d, null, 2));
    }
    console.log('\nIf a field above is null or a section is empty on a profile that has data, stop and send me');
    console.log(`the file in ${join(outDir, 'details')}: it holds the page's raw text, so I can fix the parser without a re-crawl.\n`);
  }
}

// ── finish ───────────────────────────────────────────────────────────────────────────────────
run.finishedAt = new Date().toISOString();
run.blockedRequests = blocked;
writeJson(join(outDir, 'run.json'), run);
await browser.close();

if (blocked.length) {
  warn(`The guard refused ${blocked.length} non-GET request(s), e.g. ${blocked[0].method} ${blocked[0].url}`);
  warn('If the panel needs POST to read data and a list came back empty, re-run with --allow-write "<regex>".');
}

if (!args.probe) {
  const { report } = consolidateDir(outDir);
  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify({ counts: report.counts, checks: report.checks }, null, 2));
  console.log(`\nOutputs are in ${outDir}`);
  console.log('  private/    real emails, wallets and balances. Keep on this machine. Never commit.');
  console.log('  shareable/  aliased emails, no wallets or ids. Safe to share for review.');
  console.log('  rates.json  every commission rate seen, and where it changed.');
}
