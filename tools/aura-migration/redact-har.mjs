// Redact a browser HAR capture so it can be shared for analysis.
//
// Run by the operator on their own machine, on a capture they recorded themselves.
// Reads <name>.har, writes <name>.redacted.json. Nothing leaves the machine and no
// dependencies are needed.
//
// What it does:
//   - keeps only JSON API responses. Pages, scripts, styles, images and fonts are dropped,
//     so the vendor's frontend code is not copied and the file stays small;
//   - removes cookies and every credential-bearing header, request and response;
//   - blanks password / token / secret / otp fields in request bodies and response bodies;
//   - replaces each email address with a stable alias (member-1@redacted.invalid, ...), so
//     "the same member" is still recognisable across requests without being identifiable.
//
// What it deliberately keeps: URLs, status codes, JSON structure, amounts, tiers, dates,
// wallet addresses and transaction hashes. Those are the evidence. Wallet addresses are
// public on chain, but tell the client they are in the file.
//
// Usage:
//   node redact-har.mjs capture.har            ->  capture.redacted.json
//   node redact-har.mjs capture.har --out x.json
//
// Then read the report it prints, and open the output once yourself before sharing it.

import { readFileSync, writeFileSync } from 'node:fs';

const [input, ...rest] = process.argv.slice(2);
if (!input) {
  console.error('Usage: node redact-har.mjs <capture.har> [--out <file>]');
  process.exit(1);
}
const outIndex = rest.indexOf('--out');
const output = outIndex >= 0 && rest[outIndex + 1] ? rest[outIndex + 1] : input.replace(/\.har$/i, '') + '.redacted.json';

const har = JSON.parse(readFileSync(input, 'utf8'));
const entries = har?.log?.entries;
if (!Array.isArray(entries)) {
  console.error('That does not look like a HAR file (no log.entries).');
  process.exit(1);
}

const SENSITIVE_HEADER = /^(cookie|set-cookie|authorization|proxy-authorization|x-.*(token|key|auth|secret|session|csrf|xsrf).*|.*-(token|key|secret)|api-key)$/i;
// Keys that are credentials whatever they hold.
const STRONG_FIELD = /pass(word|wd)?|secret|jwt|(^|[^a-z])otp|mnemonic|seed ?phrase|private|authorization|cookie|credential|signature|(access|refresh|id|auth|session|bearer|api|csrf|xsrf)[-_ ]?(token|key)/i;
// Keys that are sometimes a credential and sometimes data we need ("token": "USDT", a token
// address). Kept only when the value is plainly data: a token symbol (letters only, "USDT") or
// a 40-hex-digit address. Any other string is blanked, so a short or odd-looking credential
// is lost rather than leaked.
const AMBIGUOUS_FIELD = /^(token|session)$/i;
const ADDRESS = /^0x[0-9a-f]{40}$/i;
const SYMBOL = /^[A-Za-z]{2,10}$/;

function isSensitive(key, value) {
  if (STRONG_FIELD.test(key)) return true;
  return AMBIGUOUS_FIELD.test(key) && typeof value === 'string' && !ADDRESS.test(value) && !SYMBOL.test(value);
}
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const aliases = new Map();
const alias = (email) => {
  const key = email.toLowerCase();
  if (!aliases.has(key)) aliases.set(key, `member-${aliases.size + 1}@redacted.invalid`);
  return aliases.get(key);
};
const maskEmails = (text) => text.replace(EMAIL, alias);

const safeDecode = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

const stats = { total: entries.length, kept: 0, droppedNonJson: 0, fieldsBlanked: 0, headersRemoved: 0 };

/** Blank sensitive keys anywhere in a parsed JSON value. */
function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (isSensitive(key, v)) {
        out[key] = '[REDACTED]';
        stats.fieldsBlanked += 1;
      } else {
        out[key] = scrub(v);
      }
    }
    return out;
  }
  return value;
}

/** Scrub a body that may be JSON, a form post, or plain text. */
function scrubBody(text) {
  if (typeof text !== 'string' || text === '') return text;
  try {
    return maskEmails(JSON.stringify(scrub(JSON.parse(text))));
  } catch {
    // Not JSON: treat it as a form body or opaque text.
    const form = text.replace(/([^&=\s]+)=([^&]*)/g, (match, key, value) => {
      if (!isSensitive(safeDecode(key), safeDecode(value))) return match;
      stats.fieldsBlanked += 1;
      return `${key}=%5BREDACTED%5D`;
    });
    return maskEmails(form);
  }
}

function scrubHeaders(headers = []) {
  return headers.filter((h) => {
    const drop = SENSITIVE_HEADER.test(h.name);
    if (drop) stats.headersRemoved += 1;
    return !drop;
  });
}

function scrubUrl(url) {
  try {
    const u = new URL(url);
    for (const [key, value] of [...u.searchParams.entries()]) {
      if (isSensitive(key, value)) {
        u.searchParams.set(key, 'REDACTED');
        stats.fieldsBlanked += 1;
      }
    }
    return maskEmails(u.toString());
  } catch {
    return maskEmails(url);
  }
}

function responseText(content) {
  if (!content || typeof content.text !== 'string') return undefined;
  if (content.encoding === 'base64') return Buffer.from(content.text, 'base64').toString('utf8');
  return content.text;
}

const kept = [];
for (const entry of entries) {
  const mime = (entry.response?.content?.mimeType ?? '').toLowerCase();
  if (!mime.includes('json')) {
    stats.droppedNonJson += 1;
    continue;
  }

  const body = responseText(entry.response.content);
  const post = entry.request?.postData;
  kept.push({
    startedDateTime: entry.startedDateTime,
    method: entry.request?.method,
    url: scrubUrl(entry.request?.url ?? ''),
    status: entry.response?.status,
    requestHeaders: scrubHeaders(entry.request?.headers).filter((h) => /^(content-type|accept)$/i.test(h.name)),
    requestBody: post?.text ? scrubBody(post.text) : undefined,
    responseBody: body === undefined ? undefined : scrubBody(body),
  });
  stats.kept += 1;
}

writeFileSync(output, JSON.stringify({ source: input, entries: kept }, null, 2));

console.log(`\nRead      ${stats.total} requests`);
console.log(`Kept      ${stats.kept} JSON API calls`);
console.log(`Dropped   ${stats.droppedNonJson} non-JSON (pages, scripts, styles, images)`);
console.log(`Blanked   ${stats.fieldsBlanked} sensitive fields; removed ${stats.headersRemoved} credential headers`);
console.log(`Aliased   ${aliases.size} distinct email addresses`);
console.log(`\nWrote ${output}`);
console.log('Open it and search for your own password, "Bearer", "eyJ" and "token" before sharing it.\n');
