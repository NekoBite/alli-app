// AURA RUN member export — browser console version.
//
// The Playwright exporter (export-members.mjs) needs a clone, npm install and a
// browser download. This does the same job with none of that: the operator is
// already signed in and looking at the Members tab, so paste this into the
// DevTools console (Cmd+Option+J / Ctrl+Shift+J) and it saves members.csv from
// the table on screen.
//
// Same principle as the Playwright version: it reads the page you already have
// open under your own session. It never sees a credential.
//
// If the panel paginates rather than lazy-loads, run it once per page — the
// browser saves members.csv, members (1).csv, and so on.

(async () => {
  // The members list is the biggest table on the page; nav and summary tables
  // have a handful of rows at most.
  const table = [...document.querySelectorAll('table')].sort(
    (a, b) => b.querySelectorAll('tbody tr').length - a.querySelectorAll('tbody tr').length,
  )[0];

  if (!table) {
    console.error('No table found — make sure the Members tab is open.');
    return;
  }

  // Lazy lists append rows as you scroll. Scroll both the window and the
  // table's own container until the row count holds steady.
  let previous = -1;
  let stableFor = 0;
  while (stableFor < 3) {
    const current = table.querySelectorAll('tbody tr').length;
    if (current === previous) {
      stableFor += 1;
    } else {
      stableFor = 0;
      previous = current;
    }
    window.scrollTo(0, document.body.scrollHeight);
    if (table.parentElement) table.parentElement.scrollTop = table.parentElement.scrollHeight;
    await new Promise((r) => setTimeout(r, 400));
  }

  const esc = (v) => `"${String(v ?? '').trim().replace(/"/g, '""')}"`;
  const header = [...table.querySelectorAll('thead th, thead td')].map((c) => esc(c.innerText));
  const body = [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td')].map((c) => esc(c.innerText)).join(','),
  );

  console.log(`${body.length} rows captured.`);

  const blob = new Blob([[header.join(','), ...body].join('\n') + '\n'], { type: 'text/csv' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'members.csv';
  link.click();
  URL.revokeObjectURL(link.href);
})();
