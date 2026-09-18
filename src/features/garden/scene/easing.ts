/**
 * Easing curves ported from the p5 Garden Project sketch. All take `t` in 0–1
 * and return 0–1 (easeOutBack overshoots slightly past 1 on purpose — that is
 * the "pop" a plant makes when it appears).
 */

const BACK_OVERSHOOT = 1.70158;

export function easeOutBack(t: number): number {
  const x = clamp01(t) - 1;
  return x * x * ((BACK_OVERSHOOT + 1) * x + BACK_OVERSHOOT) + 1;
}

export function easeInSine(t: number): number {
  return 1 - Math.cos((clamp01(t) * Math.PI) / 2);
}

export function easeOutSine(t: number): number {
  return Math.sin((clamp01(t) * Math.PI) / 2);
}

export function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
}

export function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
