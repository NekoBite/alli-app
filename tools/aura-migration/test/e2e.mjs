// End-to-end: the real crawler, driving a real browser, against the mock admin site.
//
//   node --test test/e2e.mjs        (needs `npm install` for Playwright; set E2E_OUT to pick a folder)
//
// Not part of the default `npm test`, because it needs a browser.

import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

import { CUTOVER, startMockAdmin } from './mock-admin.mjs';

const crawler = fileURLToPath(new URL('../crawl-admin.mjs', import.meta.url));
const root = process.env.E2E_OUT ?? tmpdir();

const read = (dir, name) => readFileSync(join(dir, name), 'utf8');
const readJson = (dir, name) => JSON.parse(read(dir, name));
const countFiles = (dir) => (existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json')).length : 0);

// Async on purpose: the mock server lives in this process, so blocking it (spawnSync) would leave
// the browser waiting on a server that can never answer.
function crawl(url, out, extra = []) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [crawler, '--url', url, '--out', out, '--headless', '--yes', '--delay', '0', ...extra]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    const timer = setTimeout(() => child.kill('SIGKILL'), 240_000);
    child.on('close', (status) => {
      clearTimeout(timer);
      resolve({ status, stdout, stderr, output: `${stdout}\n${stderr}` });
    });
  });
}

describe('crawler against the mock admin', () => {
  let mock;
  let out;
  before(async () => {
    mock = await startMockAdmin({ members: 45 });
    out = mkdtempSync(join(root, 'crawl-e2e-'));
  });
  after(async () => {
    await mock.close();
  });

  it('--probe reads three profiles, prints what the parser made of them, and writes nothing else', async () => {
    const probeOut = mkdtempSync(join(root, 'crawl-probe-'));
    const r = await crawl(mock.url, probeOut, ['--probe']);
    assert.equal(r.status, 0, r.output);
    assert.match(r.stdout, /PROBE/);
    assert.equal(countFiles(join(probeOut, 'probe', 'details')), 3);
    assert.equal(existsSync(join(probeOut, 'probe', 'private')), false, 'a probe must not consolidate');
  });

  it('stops cleanly when the session expires, keeping what it had', async () => {
    mock.expireIn(10);
    const r = await crawl(mock.url, out);
    assert.equal(r.status, 0, r.output);
    assert.match(r.output, /session has expired/i);
    assert.equal(countFiles(join(out, 'details')), 10);
  });

  it('resumes: skips the profiles already on disk and finishes the rest', async () => {
    mock.neverExpire();
    const r = await crawl(mock.url, out);
    assert.equal(r.status, 0, r.output);
    assert.equal(countFiles(join(out, 'details')), 45);
    const run = readJson(out, 'run.json');
    assert.equal(run.details.fetchedThisRun, 35);
  });

  it('never wrote to the panel, and says what its guard refused', () => {
    // Every profile page fires a tracking POST on load and has live Ban / Suspend / Save buttons.
    assert.deepEqual(mock.stats.mutations, []);
    const run = readJson(out, 'run.json');
    assert.ok(run.blockedRequests.length > 0, 'the guard should have refused the page-load POSTs');
    assert.ok(run.blockedRequests.every((b) => b.method === 'POST'));
  });

  it('collected every member and every commission, with ids found from the JSON', () => {
    const members = readJson(out, 'members-list.json');
    assert.equal(members.length, 45);
    assert.ok(members.every((m) => /^c[a-z0-9]{24}$/.test(m.id)), 'every member should have an id');
    const commissions = readJson(out, 'commissions.json');
    assert.equal(commissions.length, mock.data.commissions.length);
  });

  it('parses every profile and the numbers agree with the ledger', () => {
    const report = readJson(out, 'private/report.json');
    assert.equal(report.counts.profilesParsed, 45);
    assert.equal(report.counts.profilesUnparsed, 0);
    assert.equal(report.checks.referralEarnedMismatches, 0, JSON.stringify(report.details.earnedMismatches.slice(0, 3)));
    assert.equal(report.counts.sponsorEdges, 44);
    assert.equal(report.counts.rootAccounts, 1);
    assert.equal(report.checks.asymmetricReferralLinks, 0);
  });

  it('completes the truncated wallet addresses from the API payload', () => {
    const report = readJson(out, 'private/report.json');
    assert.equal(report.counts.walletsTruncated, 0);
    assert.match(read(out, 'private/members.csv'), /"0x[a-f0-9]{40}"/);
  });

  it('finds the rate cut', () => {
    const { changes } = readJson(out, 'rates.json');
    const gen1 = changes.filter((c) => c.generation === 1);
    assert.equal(gen1.length, 1);
    assert.equal(gen1[0].from, 40);
    assert.equal(gen1[0].to, 20);
    assert.ok(gen1[0].lastRowAtOldRate < CUTOVER && gen1[0].firstRowAtNewRate >= CUTOVER);
    assert.equal(changes.filter((c) => c.generation > 1).length, 0);
  });

  it('keeps emails, wallets and ids out of the shareable files', () => {
    for (const name of ['shareable/members.csv', 'shareable/commissions.csv', 'shareable/sponsors.csv', 'shareable/report.json', 'shareable/rates.json']) {
      const text = read(out, name);
      assert.doesNotMatch(text, /@example\.com/, `${name} leaks an email`);
      assert.doesNotMatch(text, /0x[a-f0-9]{40}/, `${name} leaks a wallet`);
      assert.doesNotMatch(text, /\bc0{10,}[a-z0-9]{10,}\b/, `${name} leaks an id`);
    }
  });

  it('--only consolidate rebuilds from disk with no browser', () => {
    const r = spawnSync(process.execPath, [crawler, '--out', out, '--only', 'consolidate'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /profilesParsed/);
  });
});
