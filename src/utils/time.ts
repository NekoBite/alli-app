/** Local calendar day as YYYY-MM-DD — the key the daily reward cap is bucketed by. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function relativeTime(timestamp: number, now = Date.now()): string {
  const seconds = Math.round((now - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

/** Human countdown for tree maturity: "3d 4h", "2h 10m", "Ready". */
export function countdown(msRemaining: number): string {
  if (msRemaining <= 0) return 'Ready';
  const minutes = Math.floor(msRemaining / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  return `${minutes}m`;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

/**
 * The server's clock, in UTC — "17 Sep 2026, 00:03 UTC".
 *
 * Shown verbatim rather than converted to the device's zone on purpose: run
 * credits and the purchase ceiling are counted in the server's month, and a
 * phone whose clock disagrees should be able to see that it does.
 */
export function formatServerTime(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  const date = new Date(ms);
  const day = date.getUTCDate().toString().padStart(2, '0');
  const month = MONTHS[date.getUTCMonth()];
  const hours = date.getUTCHours().toString().padStart(2, '0');
  const minutes = date.getUTCMinutes().toString().padStart(2, '0');
  return `${day} ${month} ${date.getUTCFullYear()}, ${hours}:${minutes} UTC`;
}

/** A calendar date for membership expiry — the device's zone, since it is a deadline. */
export function formatDate(ms: number): string {
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleDateString();
}
