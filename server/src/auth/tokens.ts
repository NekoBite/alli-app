import { createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

import { env } from '../config/env.ts';

/**
 * Secrets are stored as HMACs, never raw and never bcrypt.
 *
 * bcrypt is the right tool for user-chosen passwords, where the threat is an
 * offline dictionary attack on something guessable. These are 256-bit random
 * tokens — there is nothing to guess — so the only requirement is that a
 * database leak is not directly usable, and that verification is constant time.
 * HMAC with a server-side pepper gives both, and stays fast enough to run on
 * every authenticated request.
 */
export function hashSecret(secret: string): string {
  return createHmac('sha256', env.TOKEN_SECRET).update(secret).digest('hex');
}

/** Session token: opaque, 256 bits, URL-safe. */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Six-digit login code. randomInt is rejection-sampled and uniform — `%1000000`
 * over random bytes would bias the low codes.
 */
export function generateLoginCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/** Constant-time compare of two hex digests. */
export function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}
