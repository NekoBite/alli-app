// Pure parsers for what the AURA RUN admin panel shows. No browser, no I/O.
//
// The crawler saves each page's visible text as a flat list of "tokens" (the text nodes in
// document order). Everything here works on that list, which is why it can be re-run offline
// after a fix: nothing depends on the live page, and nothing depends on its CSS or markup.
//
// The parsers are deliberately tolerant. A label that is missing produces a warning and a null,
// never an exception, so one odd profile cannot stop a thousand-page crawl.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const TIERS = new Set(['LEATHER', 'BRONZE', 'SILVER', 'GOLD']);
const STATUSES = new Set(['ACTIVE', 'SUSPENDED', 'BANNED', 'INACTIVE', 'PENDING']);
const CUID = /^c[a-z0-9]{20,32}$/;
const DATE_TIME = /(\d{1,2})\/(\d{1,2})\/(\d{4})(?:,?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/;

const pad = (n) => String(n).padStart(2, '0');

/** "1,234.0045", "+2.5", "−25" (U+2212), "5,000,000 ALLI" → a number, or null. */
export function parseAmount(text) {
  if (text === null || text === undefined) return null;
  const cleaned = String(text)
    .replace(/[−–]/g, '-')
    .replace(/,/g, '')
    .match(/[-+]?\d+(?:\.\d+)?/);
  return cleaned ? Number(cleaned[0]) : null;
}

/**
 * The panel prints DD/MM/YYYY, HH:mm:ss and does not say in which time zone. The result keeps the
 * wall-clock time exactly as shown, with no zone, so nothing downstream mistakes it for UTC.
 */
export function parseAdminDate(text) {
  const m = DATE_TIME.exec(String(text ?? ''));
  if (!m) return null;
  const [, d, mo, y, h, mi, s] = m;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return h === undefined ? date : `${date}T${pad(h)}:${mi}:${s ?? '00'}`;
}

/** "Showing 1–50 of 3,177 records" and "Page 1 of 64" → numbers, or null where the page has none. */
export function parsePager(text) {
  const page = /Page\s+(\d+)\s+of\s+(\d+)/i.exec(text);
  const showing = /Showing\s+([\d,]+)\s*[–—-]\s*([\d,]+)\s+of\s+([\d,]+)/i.exec(text);
  const n = (v) => Number(String(v).replace(/,/g, ''));
  return {
    page: page ? n(page[1]) : null,
    pages: page ? n(page[2]) : null,
    from: showing ? n(showing[1]) : null,
    to: showing ? n(showing[2]) : null,
    total: showing ? n(showing[3]) : null,
  };
}

/** Maps a table's header texts to column indexes. `spec` is { key: [accepted labels...] }. */
export function mapColumns(headers, spec) {
  const norm = headers.map((h) => String(h).trim().toLowerCase());
  const out = {};
  for (const [key, names] of Object.entries(spec)) {
    const wanted = names.map((n) => n.toLowerCase());
    let at = norm.findIndex((h) => wanted.includes(h));
    if (at < 0) at = norm.findIndex((h) => wanted.some((w) => h.includes(w)));
    out[key] = at;
  }
  return out;
}

export const MEMBER_COLUMNS = {
  email: ['email', 'e-mail'],
  tier: ['tier', 'level', 'shoe'],
  status: ['status'],
  registered: ['registered', 'joined', 'created'],
  alli: ['alli'],
  usdt: ['usdt'],
};

export const COMMISSION_COLUMNS = {
  date: ['date'],
  beneficiary: ['beneficiary', 'upline'],
  source: ['source', 'downline'],
  generation: ['gen'],
  percent: ['%', 'rate'],
  amount: ['amount'],
  status: ['status'],
};

/** One commission table row (cells in header order) → a typed record. */
export function commissionFromCells(cells, cols) {
  const at = (i) => (i >= 0 ? String(cells[i] ?? '').trim() : '');
  const generation = /(\d+)/.exec(at(cols.generation));
  return {
    at: parseAdminDate(at(cols.date)),
    atRaw: at(cols.date),
    beneficiary: at(cols.beneficiary).toLowerCase(),
    source: at(cols.source).toLowerCase(),
    generation: generation ? Number(generation[1]) : null,
    percent: parseAmount(at(cols.percent)),
    amount: parseAmount(at(cols.amount)),
    status: at(cols.status).toUpperCase(),
  };
}

const LABELS = [
  ['allibalance', /^ALLI Balance$/i],
  ['usdtbalance', /^USDT Balance$/i],
  ['referralearned', /^Referral earned$/i],
  ['questsdone', /^Quests done$/i],
  ['profile', /^Profile$/i],
  ['registered', /^Registered$/i],
  ['nftshoe', /^NFT shoe$/i],
  ['referredby', /^Referred by$/i],
  ['wallet', /^Custodial wallet$/i],
  ['adminactions', /^Admin actions$/i],
  ['directreferrals', /^Direct referrals/i],
  ['commissions', /^Commissions earned$/i],
  ['withdrawals', /^Withdrawals$/i],
  ['upgrades', /^Upgrades$/i],
  ['transactions', /^Recent transactions$/i],
];

/** The index of each label's first occurrence at or after `from`, and the tokens up to the next. */
function segmentsOf(tokens, from) {
  const found = [];
  for (const [key, re] of LABELS) {
    const at = tokens.findIndex((t, i) => i >= from && re.test(t));
    if (at >= 0) found.push({ key, at });
  }
  found.sort((a, b) => a.at - b.at);
  const seg = {};
  found.forEach((f, i) => {
    const end = i + 1 < found.length ? found[i + 1].at : tokens.length;
    seg[f.key] = { at: f.at, tokens: tokens.slice(f.at + 1, end) };
  });
  return seg;
}

const join = (tokens) => tokens.join(' ').replace(/\s+/g, ' ').trim();
const isDate = (t) => /^\d{1,2}\/\d{1,2}\/\d{4},?\s+\d{1,2}:\d{2}/.test(t);
const SYMBOL = /\b(USDT|ALLI|BNB)\b/i;

function amountWithSymbol(text) {
  const amount = parseAmount(text);
  const symbol = SYMBOL.exec(text)?.[1]?.toUpperCase() ?? null;
  return { amount, symbol };
}

/**
 * One member's profile page → a typed record.
 *
 * `tokens` are the page's text nodes in document order. The sidebar comes before the profile in
 * the DOM and carries the signed-in admin's own email, so the member's email is taken as the last
 * address before the "ALLI Balance" label, never the first on the page.
 */
export function parseMemberDetail(tokens) {
  const warnings = [];
  const t = tokens.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);

  const balanceAt = t.findIndex((x) => LABELS[0][1].test(x));
  if (balanceAt < 0) {
    return { ok: false, warnings: ['no "ALLI Balance" label: not a member profile, or the layout changed'] };
  }

  const seg = segmentsOf(t, balanceAt);
  const out = { ok: true, warnings };

  // Header: email, internal id, tier badge, status badge, verified badge.
  let emailAt = -1;
  for (let i = balanceAt - 1; i >= 0; i -= 1) {
    if (EMAIL.test(t[i])) {
      emailAt = i;
      break;
    }
  }
  const header = emailAt >= 0 ? t.slice(emailAt, balanceAt) : [];
  out.email = emailAt >= 0 ? t[emailAt].toLowerCase() : null;
  out.id = header.find((x) => CUID.test(x)) ?? null;
  out.tier = header.map((x) => x.toUpperCase()).find((x) => TIERS.has(x)) ?? null;
  out.status = header.map((x) => x.toUpperCase()).find((x) => STATUSES.has(x)) ?? null;
  out.verified = header.some((x) => /^verified$/i.test(x))
    ? true
    : header.some((x) => /unverified|not verified/i.test(x))
      ? false
      : null;
  if (!out.email) warnings.push('member email not found above the balances');

  const num = (key) => (seg[key] ? parseAmount(join(seg[key].tokens)) : null);
  out.alli = num('allibalance');
  out.usdt = num('usdtbalance');

  if (seg.referralearned) {
    const text = join(seg.referralearned.tokens);
    const { amount, symbol } = amountWithSymbol(text.replace(/\d+\s*commission.*/i, ''));
    const count = /(\d[\d,]*)\s*commission/i.exec(text);
    out.referralEarned = { amount, symbol, commissionCount: count ? parseAmount(count[1]) : null };
  } else {
    out.referralEarned = null;
    warnings.push('no "Referral earned" label');
  }

  if (seg.questsdone) {
    const text = join(seg.questsdone.tokens);
    const done = /^\s*(\d[\d,]*)/.exec(text);
    const stars = /(\d[\d,.]*)\s*[^\d\s]*\s*Stars earned/i.exec(text);
    out.quests = { done: done ? parseAmount(done[1]) : null, stars: stars ? parseAmount(stars[1]) : null };
  } else {
    out.quests = null;
    warnings.push('no "Quests done" label');
  }

  const kv = (key) => (seg[key] ? join(seg[key].tokens) : null);
  const registered = kv('registered');
  out.registered = registered ? parseAdminDate(registered) : null;
  out.registeredRaw = registered;
  out.nftShoe = (kv('nftshoe') ?? '').toUpperCase() || null;

  const referredBy = seg.referredby ? seg.referredby.tokens.find((x) => EMAIL.test(x)) : null;
  out.referredBy = referredBy ? referredBy.toLowerCase() : null;
  if (!seg.referredby) warnings.push('no "Referred by" label');

  // The wallet may be cut short with an ellipsis. The crawler completes it from the API payload.
  const walletToken = seg.wallet ? seg.wallet.tokens.find((x) => /^0x[0-9a-fA-F]{4,}/.test(x)) : null;
  out.wallet = walletToken ?? null;
  out.walletTruncated = walletToken ? !/^0x[0-9a-fA-F]{40}$/.test(walletToken) : null;
  if (!seg.wallet) warnings.push('no "Custodial wallet" label');

  out.directReferrals = [];
  out.directReferralsCount = null;
  if (seg.directreferrals) {
    const label = t[seg.directreferrals.at];
    const count = /\((\d+)\)/.exec(`${label} ${seg.directreferrals.tokens.slice(0, 2).join(' ')}`);
    out.directReferralsCount = count ? Number(count[1]) : null;
    let row = null;
    for (const x of seg.directreferrals.tokens) {
      if (/^Gen\s*\d+$/i.test(x)) {
        if (row) out.directReferrals.push(row);
        row = { genLabel: x, email: null, tier: null, commission: null };
      } else if (row) {
        if (EMAIL.test(x)) row.email = x.toLowerCase();
        else if (TIERS.has(x.toUpperCase())) row.tier = x.toUpperCase();
        else if (/no commission/i.test(x)) row.commission = 'none';
        else if (/commission paid/i.test(x)) row.commission = 'paid';
      }
    }
    if (row) out.directReferrals.push(row);
  } else {
    warnings.push('no "Direct referrals" label');
  }

  out.commissionsEarned = [];
  if (seg.commissions) {
    let email = null;
    let rest = [];
    const flush = () => {
      if (email) out.commissionsEarned.push({ email, ...amountWithSymbol(join(rest)) });
    };
    for (const x of seg.commissions.tokens) {
      if (EMAIL.test(x)) {
        flush();
        email = x.toLowerCase();
        rest = [];
      } else if (email) {
        rest.push(x);
      }
    }
    flush();
  } else {
    warnings.push('no "Commissions earned" label');
  }

  out.withdrawals = [];
  if (seg.withdrawals) {
    let pending = null;
    for (const x of seg.withdrawals.tokens) {
      if (/^(COMPLETED|PENDING|FAILED|REJECTED|PROCESSING|APPROVED|CANCELLED)$/i.test(x)) {
        if (pending) out.withdrawals.push({ ...amountWithSymbol(join(pending)), status: x.toUpperCase() });
        pending = null;
      } else if (/^No withdrawals/i.test(x)) {
        pending = null;
      } else {
        pending = [...(pending ?? []), x];
      }
    }
    if (pending) out.withdrawals.push({ ...amountWithSymbol(join(pending)), status: null });
  }

  out.upgrades = [];
  if (seg.upgrades) {
    const text = seg.upgrades.tokens.filter((x) => !/^No upgrades/i.test(x));
    let current = [];
    const flush = () => {
      if (current.length === 0) return;
      const joined = join(current);
      const status = /(CONFIRMED|PENDING|FAILED|CANCELLED)/i.exec(joined)?.[1]?.toUpperCase() ?? null;
      out.upgrades.push({ ...amountWithSymbol(joined.replace(DATE_TIME, '')), status, at: parseAdminDate(joined) });
      current = [];
    };
    for (const x of text) {
      // A new entry starts at the next amount, once the previous one has its status.
      if (/^\d[\d,.]*\s*(USDT|ALLI)?$/i.test(x) && current.some((c) => /CONFIRMED|PENDING|FAILED|CANCELLED/i.test(c))) flush();
      current.push(x);
    }
    flush();
  }

  out.transactions = [];
  if (seg.transactions) {
    let row = null;
    for (const x of seg.transactions.tokens) {
      if (isDate(x)) {
        if (row) out.transactions.push(row);
        row = { at: parseAdminDate(x), type: null, currency: null, amount: null, balance: null, _rest: [] };
      } else if (row) {
        row._rest.push(x);
      }
    }
    if (row) out.transactions.push(row);
    for (const r of out.transactions) {
      const [type, currency, amount, balance] = r._rest;
      r.type = type ?? null;
      r.currency = currency ?? null;
      r.amount = parseAmount(amount);
      r.balance = parseAmount(balance);
      delete r._rest;
    }
  } else {
    warnings.push('no "Recent transactions" label');
  }

  // The panel caps these lists. Flag a profile where the cap hid history, so nobody treats the
  // page as a full ledger.
  out.truncated = {
    commissions:
      out.referralEarned?.commissionCount != null &&
      out.commissionsEarned.length < out.referralEarned.commissionCount,
    transactions: out.transactions.length >= 15,
  };

  return out;
}

/**
 * The Dashboard's tiles → named figures, as the strings the panel prints. Most tiles print the
 * label above the value; the Activity row prints the value above the label.
 */
export function parseDashboard(tokens) {
  const t = tokens.map((x) => String(x).replace(/\s+/g, ' ').trim()).filter(Boolean);
  const after = (re) => {
    const i = t.findIndex((x) => re.test(x));
    return i >= 0 ? (t[i + 1] ?? null) : null;
  };
  const before = (re) => {
    const i = t.findIndex((x) => re.test(x));
    return i > 0 ? t[i - 1] : null;
  };
  return {
    totalMembers: after(/^Total Members$/i),
    tiersLeatherSilverGold: after(/^Tiers/i),
    pendingWithdrawals: after(/^Pending Withdrawals$/i),
    confirmedUpgrades: after(/^Confirmed Upgrades$/i),
    revenueUsdt: after(/^Revenue \(USDT\)$/i),
    commissionPaidUsdt: after(/^Commission paid \(USDT\)$/i),
    netProfitUsdt: after(/^Net profit \(USDT\)$/i),
    starsAwarded: after(/^Stars awarded$/i),
    withdrawnUsdt: before(/^USDT \(\d+\)$/i),
    withdrawnAlli: before(/^ALLI \(\d+\)$/i),
    newUsers: before(/^new users$/i),
    upgradesInPeriod: before(/^upgrades$/i),
    questsInPeriod: before(/^quests$/i),
    sweeps: before(/^sweeps$/i),
    gasBnb: after(/^Gas \(BNB\)$/i),
    hotUsdt: after(/^Hot USDT$/i),
    hotAlli: after(/^Hot ALLI$/i),
    treasuryAlli: after(/^Treasury ALLI$/i),
  };
}
