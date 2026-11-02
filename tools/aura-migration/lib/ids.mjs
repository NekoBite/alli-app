// Finding each member's internal id, which is what the profile URL is built from.
//
// Two independent sources, because neither is guaranteed:
//   1. links in the tables (the commission list links every address to /members/<id>);
//   2. the JSON the panel itself loads, where a member object carries both `email` and `id`.

const CUID = /^c[a-z0-9]{20,32}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const looksLikeId = (v) => typeof v === 'string' && (CUID.test(v) || UUID.test(v));

/** "/members/<id>?tab=x" → the id, or null. */
export function idFromHref(href) {
  const m = /\/members\/([A-Za-z0-9_-]+)/.exec(String(href ?? ''));
  return m && looksLikeId(m[1]) ? m[1] : null;
}

/** Every object in a JSON value that has both an email and an id-shaped `id`. */
export function idsFromJson(value, into = new Map()) {
  if (Array.isArray(value)) {
    for (const v of value) idsFromJson(v, into);
  } else if (value && typeof value === 'object') {
    const { email, id } = value;
    if (typeof email === 'string' && EMAIL.test(email) && looksLikeId(id)) {
      into.set(email.toLowerCase(), id);
    }
    for (const v of Object.values(value)) idsFromJson(v, into);
  }
  return into;
}

/** A full 0x address in a JSON payload that begins with a truncated one shown on the page. */
export function completeWallet(truncated, jsonValues) {
  if (!truncated) return null;
  const prefix = truncated.replace(/[….]+$/, '').toLowerCase();
  if (prefix.length < 6) return null;
  let found = null;
  const walk = (v) => {
    if (found) return;
    if (typeof v === 'string') {
      if (/^0x[0-9a-fA-F]{40}$/.test(v) && v.toLowerCase().startsWith(prefix)) found = v;
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === 'object') {
      Object.values(v).forEach(walk);
    }
  };
  jsonValues.forEach(walk);
  return found;
}
