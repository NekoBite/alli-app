# AURA RUN migration tools

Operator-run tools for reading the old AURA RUN admin panel and preparing a migration into ALLI.
Everything here runs **on your machine**, in a browser **you** log in to. Nothing receives or stores
a credential. The output holds personal data: it stays on your machine and out of git
(`capture/` is ignored).

| Tool | What it does |
|---|---|
| `crawl-admin.mjs` | Reads the dashboard, the Members list, the whole Commissions ledger and every member's profile. **Read-only.** |
| `redact-har.mjs` | Strips a browser network recording (HAR) so it can be shared. |
| `console-export.js`, `export-members.mjs` | The earlier Members-list-only exporters. The crawler replaces them. |
| `import-members.mjs` | Dry-run importer: turns `members.csv` into reviewable JSON and seed SQL. |

## Running the crawler

```bash
cd tools/aura-migration
npm install
npx playwright install chromium     # once
```

**1. Probe first.** Reads one page of each list and three profiles, then prints what the parser made
of them. This is the check that the crawler understands the real pages.

```bash
npm run probe
```

A Chromium window opens. Log in yourself, wait for the Dashboard, then press Enter in the terminal.
If a field in the printout is `null`, or a section is empty on a profile that has data, stop and send
the files in `capture/probe/details/`. They hold each page's raw text, so the parser can be fixed
without crawling again.

**2. Then the full crawl.**

```bash
npm run crawl
```

About 1,200 profile pages: expect 30–50 minutes. It pauses between pages, saves every profile as it
goes, and can be stopped with Ctrl-C and re-run: it resumes where it stopped. If the panel logs you
out it says so and stops; log in again and re-run the same command.

Useful flags: `--delay 1500` to go slower, `--limit 50` to try a slice, `--force` to re-read profiles
already on disk, `--only consolidate` to rebuild the outputs from disk without a browser.

## Why it is read-only

It only navigates and clicks "Next". It never touches Activate, Suspend, Ban or Save on a profile.
On top of that, once you press Enter the browser **refuses every request that is not a GET**, so even
a stray click could not change a member. The refused requests are listed in `capture/run.json`.
If a list comes back empty because the panel reads data with POST, re-run with
`--allow-write "<regex matching that URL>"`.

## What you get

```
capture/
  private/      real emails, wallets and balances. Keep on this machine. Never commit.
    members.csv  members.json  commissions.csv  sponsors.csv  report.json
  shareable/    the same figures with every email replaced by an alias, no wallets, no ids.
    members.csv  commissions.csv  sponsors.csv  rates.json  report.json
  rates.json    every commission rate seen, and where it changed
  details/      each profile's raw text and the panel's own JSON (re-parseable)
  api/          the JSON behind each list page
```

`shareable/` is what to send for review. It is enough to see the commission-rate history, the
sponsor tree's shape, tier counts and balances, without naming anyone.

`report.json` cross-checks the capture against itself: each profile's "Referral earned" against the
commission ledger, each member's sponsor against the sponsor's own referral list, and how many
profiles the panel capped. Read it before trusting the data.

**Known limits.** The panel caps a profile's commission and withdrawal lists at 10 and its recent
transactions at 15, so a profile is not a full history. The Commissions list is the complete
commission ledger. Withdrawal and deposit history beyond those caps is not available from this panel.

## Tests

```bash
npm test            # parsers and consolidation: no browser, no network
npm run test:e2e    # the real crawler against a local mock of the panel (needs Playwright)
```

The mock reproduces the awkward parts on purpose: rows with no links, live Ban and Save buttons, a
POST fired on every page load, capped lists. Every email in the tests is invented.
