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

/**
 * Stars, to the ledger's precision: "3", "0.5", "12.25". Whole stars show no
 * decimals, so the run quest still reads as it always did.
 */
export function formatStars(stars: number): string {
  if (!Number.isFinite(stars)) return '0';
  const rounded = Math.round(stars * 100) / 100;
  return rounded.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
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

/** Speed in km/h — the figure the run screen shows beside pace. */
export function formatSpeedKmh(metresPerSecond: number): string {
  if (!Number.isFinite(metresPerSecond) || metresPerSecond <= 0) return '0.0';
  return (metresPerSecond * 3.6).toFixed(1);
}

/** Money amounts that are always shown to the cent (commissions, USDT totals): "1,007.47". */
export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '0.00';
  return amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
