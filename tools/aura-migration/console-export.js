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
// The Members list paginates (20 rows a page, "Showing 1-20 of N members",
// "Page X of Y"), so this clicks through every page and accumulates rows.
//
// Page turns are tracked by reading the "Page X of Y" indicator, not by
// watching the first row change. The row-change check could not tell one
// advance from two, and a real run lost a whole page of 20 members that way
// while reporting success. Reading the counter means a skipped page is both
// impossible to miss and reported by number.

(async () => {
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

  const pageNo = () => {
    const m = document.body.innerText.match(/Page\s+(\d+)\s+of\s+(\d+)/i);
    return m ? [Number(m[1]), Number(m[2])] : null;
  };

  const claimedTotal = () => {
    const m = document.body.innerText.match(/of\s+([\d,]+)\s+members/i);
    return m ? Number(m[1].replace(/,/g, '')) : null;
  };

  const nextBtn = () =>
    [...document.querySelectorAll('button, a')].find((el) => {
      const label = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''}`;
      if (!/next/i.test(label)) return false;
      return !el.disabled && el.getAttribute('aria-disabled') !== 'true';
    });

  const table = getTable();
  if (!table) {
    console.error('No table found — make sure the Members tab is open.');
    return;
  }

  const header = [...table.querySelectorAll('thead th, thead td')]
    .map((c) => esc(c.innerText))
    .join(',');

  const seen = new Set();
  const all = [];
  const skipped = [];
  let [current, total] = pageNo() ?? [1, 1];

  for (;;) {
    let added = 0;
    for (const row of rowsOf(getTable())) {
      const key = (row[0] || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      all.push(row);
      added += 1;
    }
    console.log(`page ${current}/${total}: +${added} (total ${all.length})`);

    if (current >= total) break;

    const want = current + 1;
    const btn = nextBtn();
    if (!btn) {
      console.warn(`No enabled "next" control on page ${current} of ${total}.`);
      break;
    }
    btn.click();

    let advanced = false;
    for (let i = 0; i < 60; i += 1) {
      await sleep(200);
      const p = pageNo();
      if (!p) continue;
      if (p[0] === want) {
        [current, total] = p;
        advanced = true;
        break;
      }
      // Jumped past the page we wanted — record exactly which rows were lost
      // rather than quietly returning a short export.
      if (p[0] > want) {
        for (let n = want; n < p[0]; n += 1) skipped.push(n);
        [current, total] = p;
        advanced = true;
        break;
      }
    }
    if (!advanced) {
      console.warn(`Stuck leaving page ${current} — stopping.`);
      break;
    }
  }

  window.__csv = [header, ...all.map((r) => r.map(esc).join(','))].join('\n') + '\n';

  const claimed = claimedTotal();
  console.log(`DONE — ${all.length}${claimed ? ` of ${claimed}` : ''} members captured.`);
  if (skipped.length) console.warn(`SKIPPED PAGES: ${skipped.join(', ')}`);
  if (claimed && all.length < claimed) {
    console.warn(`SHORT BY ${claimed - all.length} — do not treat this export as complete.`);
  }

  const blob = new Blob([window.__csv], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'members.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
})();
