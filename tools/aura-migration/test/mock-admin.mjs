// A stand-in for the old admin panel, for testing the crawler without touching the real one.
//
// It copies the awkward parts, not the look: a list that paginates on the client and whose rows
// carry no links (so ids must come from the JSON), profile pages with live Suspend / Ban / Save
// buttons, a POST fired on page load, lists the panel caps at 10 and 15, and the "Gen N" badge
// that counts rows. Every email is invented.

import { createServer } from 'node:http';

const cuid = (i) => `c${i.toString(36).padStart(24, '0')}`;
const TIERS = ['LEATHER', 'SILVER', 'GOLD'];
const MEMBERS_PER_PAGE = 20;
const COMMISSIONS_PER_PAGE = 40;

/** The rate cut: Gen 1 paid 40% before this moment and 20% after. */
export const CUTOVER = '2026-10-31T18:00:00';

export function buildData(count = 45) {
  const members = Array.from({ length: count }, (_, i) => ({
    i,
    id: cuid(i + 1),
    email: `user${i}@example.com`,
    tier: i === 0 ? 'GOLD' : TIERS[i % 3],
    status: i % 17 === 5 ? 'SUSPENDED' : 'ACTIVE',
    registeredAt: new Date(Date.UTC(2026, 5, 1) + i * 86_400_000 * 2).toISOString().slice(0, 19),
    sponsor: i === 0 ? null : Math.floor((i - 1) / 3),
    wallet: `0x${(i + 1).toString(16).padStart(40, 'a')}`,
    alli: i * 1000.5,
    usdt: i * 2.25,
  }));

  // Every non-Leather member's upgrade pays its upline, newest rows last until sorted.
  const commissions = [];
  let n = 0;
  for (const m of members) {
    if (m.tier === 'LEATHER') continue;
    const at = new Date(Date.UTC(2026, 9, 20) + n * 3_600_000 * 12).toISOString().slice(0, 19);
    n += 1;
    let up = m.sponsor;
    for (let gen = 1; gen <= 4 && up !== null; gen += 1) {
      const percent = gen === 1 ? (at < CUTOVER ? 40 : 20) : 10;
      commissions.push({ at, beneficiary: members[up], source: m, generation: gen, percent, amount: (25 * percent) / 100 });
      up = members[up].sponsor;
    }
  }
  commissions.sort((a, b) => (a.at < b.at ? 1 : -1)); // newest first, like the panel
  return { members, commissions };
}

const fmtDate = (iso) => {
  const [d, t] = iso.split('T');
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}, ${t}`;
};

const SIDEBAR = `
<aside>
  <div>AURA RUN</div><div>ADMIN</div><div>OVERVIEW</div>
  <a href="/">Dashboard</a><div>OPERATIONS</div>
  <a href="/members">Members</a><a href="/commissions">Commissions</a><a href="/logs">Admin Logs</a>
  <div class="me"><span>D</span><span>admin@example.com</span><span>ADMIN</span></div>
</aside>`;

const shell = (title, body, script = '') => `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:14px sans-serif;display:flex;margin:0}aside{width:200px;padding:12px}main{flex:1;padding:16px}table{border-collapse:collapse}td,th{padding:4px 10px;text-align:left}</style>
</head><body>${SIDEBAR}<main>${body}</main><script>${script}</script></body></html>`;

/**
 * @param {{ members?: number, expireAfter?: number }} options
 *   expireAfter: after this many profile requests the panel answers with the login page.
 */
export function startMockAdmin({ members: count = 45, expireAfter: initialExpire = Infinity } = {}) {
  let expireAfter = initialExpire;
  const { members, commissions } = buildData(count);
  const stats = { mutations: [], profileRequests: 0, requests: 0 };
  const byId = new Map(members.map((m) => [m.id, m]));

  const json = (res, data, status = 200) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  const server = createServer((req, res) => {
    stats.requests += 1;
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;

    if (req.method !== 'GET') {
      stats.mutations.push(`${req.method} ${path}`);
      return json(res, { ok: true });
    }

    // ── API ──
    if (path === '/api/admin/members') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const rows = members.slice((page - 1) * MEMBERS_PER_PAGE, page * MEMBERS_PER_PAGE);
      return json(res, {
        total: members.length,
        page,
        pages: Math.ceil(members.length / MEMBERS_PER_PAGE),
        data: rows.map((m) => ({ id: m.id, email: m.email, tier: m.tier, status: m.status, createdAt: m.registeredAt, alli: m.alli, usdt: m.usdt })),
      });
    }
    if (path === '/api/admin/commissions') {
      const page = Number(url.searchParams.get('page') ?? 1);
      const rows = commissions.slice((page - 1) * COMMISSIONS_PER_PAGE, page * COMMISSIONS_PER_PAGE);
      return json(res, {
        total: commissions.length,
        page,
        pages: Math.ceil(commissions.length / COMMISSIONS_PER_PAGE),
        data: rows.map((c) => ({
          at: c.at,
          generation: c.generation,
          percent: c.percent,
          amount: c.amount,
          status: 'CREDITED',
          beneficiary: { id: c.beneficiary.id, email: c.beneficiary.email },
          source: { id: c.source.id, email: c.source.email },
        })),
      });
    }
    const detailApi = /^\/api\/admin\/members\/([^/]+)$/.exec(path);
    if (detailApi) {
      const m = byId.get(detailApi[1]);
      if (!m) return json(res, { error: 'not found' }, 404);
      return json(res, { id: m.id, email: m.email, wallet: m.wallet });
    }

    // ── pages ──
    if (path === '/' || path === '/index') {
      return html(
        res,
        shell(
          'Dashboard',
          `<h1>Dashboard</h1><div>Total Members</div><div>${members.length}</div><div>Tiers (L/S/G)</div><div>10 / 20 / 15</div>
           <div>Pending Withdrawals</div><div>0</div><div>Revenue (USDT)</div><div>2,000</div>
           <div>Commission paid (USDT)</div><div>900</div><div>Treasury ALLI</div><div>1,000,000,000</div>`,
        ),
      );
    }
    if (path === '/members') return html(res, listPage('members'));
    if (path === '/commissions') return html(res, listPage('commissions'));
    const profile = /^\/members\/([^/]+)$/.exec(path);
    if (profile) {
      stats.profileRequests += 1;
      if (stats.profileRequests > expireAfter) {
        res.writeHead(302, { location: '/login' });
        return res.end();
      }
      const m = byId.get(profile[1]);
      return m ? html(res, profilePage(m)) : html(res, shell('Not found', '<h1>Not found</h1>'), 404);
    }
    if (path === '/login') return html(res, shell('Login', '<h1>Sign in</h1>'));
    return html(res, shell('Not found', '<h1>Not found</h1>'), 404);
  });

  const html = (res, body, status = 200) => {
    res.writeHead(status, { 'content-type': 'text/html; charset=utf-8' });
    res.end(body);
  };

  const listPage = (kind) => {
    const isMembers = kind === 'members';
    const head = isMembers
      ? ['Email', 'Tier', 'Status', 'Registered', 'ALLI', 'USDT']
      : ['Date', 'Beneficiary (upline)', 'Source (downline)', 'Gen', '%', 'Amount (USDT)', 'Status'];
    const per = isMembers ? MEMBERS_PER_PAGE : COMMISSIONS_PER_PAGE;
    const script = `
      const kind = ${JSON.stringify(kind)}, per = ${per};
      const fmt = (iso) => { const [d,t] = iso.split('T'); const [y,m,day] = d.split('-'); return day+'/'+m+'/'+y+', '+t; };
      async function load(page) {
        const r = await fetch('/api/admin/'+kind+'?page='+page); const j = await r.json();
        const rows = j.data.map(x => kind === 'members'
          ? '<tr><td>'+x.email+'</td><td>'+x.tier+'</td><td>'+x.status+'</td><td>'+fmt(x.createdAt).split(',')[0]+'</td><td>'+x.alli+'</td><td>'+x.usdt+'</td></tr>'
          : '<tr><td>'+fmt(x.at)+'</td><td><a href="/members/'+x.beneficiary.id+'">'+x.beneficiary.email+'</a></td><td><a href="/members/'+x.source.id+'">'+x.source.email+'</a></td><td>Gen '+x.generation+'</td><td>'+x.percent+'%</td><td>'+x.amount+'</td><td>'+x.status+'</td></tr>').join('');
        document.querySelector('tbody').innerHTML = rows;
        const from = (j.page-1)*per+1, to = Math.min(j.page*per, j.total);
        document.getElementById('info').textContent = 'Showing '+from+'\\u2013'+to+' of '+j.total+' '+(kind === 'members' ? 'members' : 'records');
        document.getElementById('pg').textContent = 'Page '+j.page+' of '+j.pages;
        document.getElementById('prev').disabled = j.page <= 1;
        document.getElementById('next').disabled = j.page >= j.pages;
        window.__page = j.page;
      }
      document.getElementById('prev').onclick = () => load(window.__page - 1);
      document.getElementById('next').onclick = () => load(window.__page + 1);
      load(1);`;
    return shell(
      isMembers ? 'Members' : 'Commissions',
      `<h1>${isMembers ? 'Members' : 'Commissions'}</h1>
       <table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody></tbody></table>
       <div id="info"></div><button id="prev">‹ Prev</button><span id="pg"></span><button id="next">Next ›</button>`,
      script,
    );
  };

  const profilePage = (m) => {
    const children = members.filter((c) => c.sponsor === m.i);
    const earned = commissions.filter((c) => c.beneficiary.i === m.i);
    const earnedTotal = earned.reduce((s, c) => s + c.amount, 0);
    const upgrade = m.tier === 'LEATHER' ? [] : [{ amount: 25, at: fmtDate(m.registeredAt) }];
    const row = (cells) => `<tr>${cells.map((c) => `<td>${c}</td>`).join('')}</tr>`;
    const body = `
      <a href="/members">Members</a>
      <div><span>${m.email[0].toUpperCase()}</span><h1>${m.email}</h1><code>${m.id}</code></div>
      <span>${m.tier}</span><span>${m.status}</span><span>Verified</span>
      <div><div>ALLI Balance</div><div>${m.alli.toLocaleString('en-US')}</div></div>
      <div><div>USDT Balance</div><div>${m.usdt.toLocaleString('en-US')}</div></div>
      <div><div>Referral earned</div><div><b>${earnedTotal}</b> <span>USDT</span></div><div>${earned.length} commission(s)</div></div>
      <div><div>Quests done</div><div>${m.i}</div><div>${m.i * 2} <span>⭐</span> Stars earned</div></div>
      <section><h3>Profile</h3>
        <div><span>Registered</span><span>${fmtDate(m.registeredAt)}</span></div>
        <div><span>NFT shoe</span><span>${m.tier}</span></div>
        <div><span>Referred by</span><span>${m.sponsor === null ? '—' : members[m.sponsor].email}</span></div>
        <h4>Custodial wallet</h4><code>${m.wallet.slice(0, 34)}…</code><button>copy</button>
      </section>
      <section><h3>Admin actions</h3><div>Shoe tier (manual override)</div>
        <select><option>Leather</option><option>Silver</option><option>Gold</option></select>
        <button id="save">Save</button><div>Account status</div>
        <button id="activate">Activate</button><button id="suspend">Suspend</button><button id="ban">Ban</button>
      </section>
      <section><h3>Direct referrals (${children.length})</h3>
        ${children.length ? children.map((c, k) => `<div><b>Gen ${k + 1}</b> <span>${c.email}</span> <i>${c.tier}</i> <small>${c.tier === 'LEATHER' ? 'no commission' : 'commission paid ✓'}</small></div>`).join('') : '<p>No referrals yet.</p>'}
      </section>
      <section><h3>Commissions earned</h3>
        ${earned.length ? earned.slice(0, 10).map((c) => `<div><span>${c.source.email}</span><span>+${c.amount} USDT</span></div>`).join('') : '<p>None yet.</p>'}
      </section>
      <section><h3>Withdrawals</h3>
        ${m.i % 2 ? '<div><span>25 USDT</span><span>COMPLETED</span></div>' : '<p>No withdrawals.</p>'}
        <h3>Upgrades</h3>
        ${upgrade.length ? upgrade.map((u) => `<div><span>${u.amount} USDT</span><span>CONFIRMED · ${u.at}</span></div>`).join('') : '<p>No upgrades.</p>'}
      </section>
      <section><h3>Recent transactions</h3>
        <table><thead><tr><th>Date</th><th>Type</th><th>Cur</th><th>Amount</th><th>Balance</th></tr></thead><tbody>
        ${earned.slice(0, 15).map((c) => row([fmtDate(c.at), 'COMMISSION', 'USDT', `+${c.amount}`, String(earnedTotal)])).join('')}
        </tbody></table>
      </section>`;
    // Pages like this fire a tracking POST on load; the crawler's guard must stop it.
    // The buttons are live, so a stray click would change the member.
    const script = `
      fetch('/api/admin/members/${m.id}').then((r) => r.json()).catch(() => {});
      fetch('/api/admin/track', { method: 'POST', body: '{}' }).catch(() => {});
      for (const id of ['save','activate','suspend','ban']) {
        document.getElementById(id).onclick = () => fetch('/api/admin/members/${m.id}/'+id, { method: 'POST' });
      }`;
    return shell(m.email, body, script);
  };

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        stats,
        data: { members, commissions },
        /** From now on, the next `n` profile requests succeed and the one after is sent to /login. */
        expireIn: (n) => {
          expireAfter = stats.profileRequests + n;
        },
        neverExpire: () => {
          expireAfter = Infinity;
        },
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}
