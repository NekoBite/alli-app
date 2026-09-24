// AURA RUN member export — browser console version.
//
// The Playwright exporter (export-members.mjs) needs a clone, npm install and a
// browser download. This does the same job with none of that: the operator is
// already signed in and looking at the Members tab, so paste this into the
// DevTools console and it walks the whole member list into members.csv.
//
// Same principle as the Playwright version: it reads the page you already have
// open under your own session. It never sees a credential.
//
// The Members list paginates (20 per page, "Showing 1-20 of N members"), so
// this clicks through every page and accumulates rows, deduplicating by email.
// It waits for the first row to actually change before reading the next page,
// rather than guessing a fixed delay.

(async () => {
  const CAP = 200; // safety stop, well above the ~53 pages the list has today
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // The members list is the biggest table on the page; nav and summary tables
  // have a handful of rows at most.
  const getTable = () =>
    [...document.querySelectorAll('table')].sort(
      (a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length,
    )[0];

  const esc = (v) => `"${String(v ?? '').trim().replace(/"/g, '""')}"`;

  const rowsOf = (t) =>
    [...t.querySelectorAll('tbody tr')].map((r) =>
      [...r.querySelectorAll('td')].map((c) => c.innerText.trim()),
    );

  const findNext = () =>
    [...document.querySelectorAll('button, a')].find((el) => {
      const label = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''}`;
      if (!/next/i.test(label)) return false;
      return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });

  let table = getTable();
  if (!table) {
    console.error('No table found — make sure the Members tab is open.');
    return;
  }

  const header = [...table.querySelectorAll('thead th, thead td')]
    .map((c) => esc(c.innerText))
    .join(',');

  const seen = new Set();
  const all = [];

  for (let page = 1; page <= CAP; page += 1) {
    table = getTable();
    let added = 0;
    for (const row of rowsOf(table)) {
      const key = (row[0] || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(row);
      added += 1;
    }
    console.log(`page ${page}: +${added} (total ${all.length})`);

    const next = findNext();
    if (!next) {
      console.log('No enabled "next" control — last page reached.');
      break;
    }

    // Wait for the table to actually turn over. A fixed delay either wastes
    // time or reads the old page on a slow request.
    const before = (rowsOf(table)[0] || [])[0] || '';
    next.click();
    let advanced = false;
    for (let i = 0; i < 50; i += 1) {
      await sleep(200);
      const now = (rowsOf(getTable())[0] || [])[0] || '';
      if (now && now !== before) {
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      console.warn('Page did not advance within 10s — stopping here.');
      break;
    }
  }

  window.__csv = [header, ...all.map((r) => r.map(esc).join(','))].join('\n') + '\n';
  console.log(`DONE — ${all.length} members captured.`);

  const blob = new Blob([window.__csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'members.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
})();
