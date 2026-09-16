import type { TokenSymbol } from '@/services/chain';

/** Token amounts: enough precision to be honest, few enough digits to read. */
export function formatToken(amount: number | string, symbol?: TokenSymbol): string {
  const n = typeof amount === 'string' ? Number(amount) : amount;
  if (!Number.isFinite(n)) return symbol ? `0 ${symbol}` : '0';

  const digits = n === 0 ? 2 : Math.abs(n) < 1 ? 4 : Math.abs(n) < 1000 ? 2 : 0;
  const text = n.toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return symbol ? `${text} ${symbol}` : text;
}

/** Fiat prices in the marketplace. */
export function formatFiat(amount: number, currency = 'USD'): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency });
}

export function formatPoints(points: number): string {
  return Math.round(points).toLocaleString('en-US');
}

/** Metres -> km with one decimal, the unit runners actually think in. */
export function formatDistance(metres: number): string {
  return (metres / 1000).toFixed(2);
}

/** Seconds -> mm:ss, or h:mm:ss past an hour. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/** Pace in min/km — the number a runner checks mid-run. */
export function formatPace(metresPerSecond: number): string {
  if (metresPerSecond <= 0.1) return '--:--';
  const secondsPerKm = 1000 / metresPerSecond;
  if (secondsPerKm > 3600) return '--:--';
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** 0x1234…cdef */
export function shortAddress(address: string, lead = 6, tail = 4): string {
  if (address.length <= lead + tail + 2) return address;
  return `${address.slice(0, lead)}…${address.slice(-tail)}`;
}
