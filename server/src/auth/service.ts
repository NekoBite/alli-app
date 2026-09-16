import { pool, transaction, type Db } from '../db/pool.ts';
import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';
import { mailer } from './mailer.ts';
import { generateLoginCode, generateSessionToken, hashSecret, safeEqualHex } from './tokens.ts';

export type User = {
  id: string;
  email: string;
  walletAddress: string | null;
  createdAt: string;
};

/** Wrong codes allowed per code before it is burned. */
const MAX_CODE_ATTEMPTS = 5;
/** Codes requested per email per window, to stop mailbox flooding. */
const MAX_CODES_PER_HOUR = 5;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function findOrCreateUser(db: Db, email: string): Promise<User> {
  const normalized = normalizeEmail(email);

  // ON CONFLICT on the functional unique index makes this safe against two
  // simultaneous first-time sign-ins for the same address.
  const { rows } = await db.query<{
    id: string;
    email: string;
    wallet_address: string | null;
    created_at: string;
    disabled_at: string | null;
  }>(
    `INSERT INTO users (email) VALUES ($1)
     ON CONFLICT (lower(email)) DO UPDATE SET email = users.email
     RETURNING id, email, wallet_address, created_at, disabled_at`,
    [normalized],
  );

  const row = rows[0]!;
  if (row.disabled_at) {
    throw ApiError.forbidden('account_disabled', 'This account has been disabled.');
  }

  return {
    id: row.id,
    email: row.email,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
  };
}

/**
 * Issues a login code.
 *
 * Returns nothing either way: whether an address has an account is not
 * something an unauthenticated caller gets to learn, so the route answers 204
 * identically for a new user, an existing one, and a rate-limited one.
 */
export async function requestLoginCode(email: string): Promise<void> {
  await transaction(async (db) => {
    const user = await findOrCreateUser(db, email);

    const { rows: recent } = await db.query<{ count: string }>(
      `SELECT count(*) FROM auth_codes
       WHERE user_id = $1 AND created_at > now() - interval '1 hour'`,
      [user.id],
    );
    if (Number(recent[0]!.count) >= MAX_CODES_PER_HOUR) {
      throw ApiError.tooMany('Too many codes requested. Try again in an hour.');
    }

    // Supersede any outstanding codes: two live codes means two chances to
    // brute force, and a user who requested a new one is not using the old.
    await db.query(
      `UPDATE auth_codes SET consumed_at = now()
       WHERE user_id = $1 AND consumed_at IS NULL`,
      [user.id],
    );

    const code = generateLoginCode();
    await db.query(
      `INSERT INTO auth_codes (user_id, code_hash, expires_at)
       VALUES ($1, $2, now() + ($3 || ' minutes')::interval)`,
      [user.id, hashSecret(code), String(env.AUTH_CODE_TTL_MINUTES)],
    );

    // Inside the transaction on purpose: if the send fails, the code is rolled
    // back rather than left live in the database for something nobody received.
    await mailer.sendLoginCode(user.email, code);
  });
}

export type Session = { token: string; expiresAt: string; user: User };

export async function verifyLoginCode(
  email: string,
  code: string,
  userAgent?: string,
): Promise<Session> {
  return transaction(async (db) => {
    const normalized = normalizeEmail(email);
    const { rows: users } = await db.query<{ id: string }>(
      'SELECT id FROM users WHERE lower(email) = $1',
      [normalized],
    );
    const userId = users[0]?.id;

    // Same error for "no such user" and "wrong code" — distinguishing them
    // turns this endpoint into an account-existence oracle.
    const invalid = ApiError.badRequest('invalid_code', 'That code is not valid or has expired.');
    if (!userId) throw invalid;

    // FOR UPDATE: two parallel guesses must not each get a fresh attempt count.
    const { rows: codes } = await db.query<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM auth_codes
       WHERE user_id = $1 AND consumed_at IS NULL AND expires_at > now()
       ORDER BY created_at DESC LIMIT 1
       FOR UPDATE`,
      [userId],
    );
    const row = codes[0];
    if (!row) throw invalid;

    if (row.attempts >= MAX_CODE_ATTEMPTS) {
      await db.query('UPDATE auth_codes SET consumed_at = now() WHERE id = $1', [row.id]);
      throw ApiError.tooMany('Too many incorrect attempts. Request a new code.');
    }

    if (!safeEqualHex(row.code_hash, hashSecret(code))) {
      await db.query('UPDATE auth_codes SET attempts = attempts + 1 WHERE id = $1', [row.id]);
      throw invalid;
    }

    await db.query('UPDATE auth_codes SET consumed_at = now() WHERE id = $1', [row.id]);

    const token = generateSessionToken();
    const { rows: sessions } = await db.query<{ expires_at: string }>(
      `INSERT INTO sessions (user_id, token_hash, expires_at, user_agent)
       VALUES ($1, $2, now() + ($3 || ' hours')::interval, $4)
       RETURNING expires_at`,
      [userId, hashSecret(token), String(env.SESSION_TTL_HOURS), userAgent ?? null],
    );

    const { rows: full } = await db.query<{
      id: string;
      email: string;
      wallet_address: string | null;
      created_at: string;
    }>('SELECT id, email, wallet_address, created_at FROM users WHERE id = $1', [userId]);
    const u = full[0]!;

    return {
      token,
      expiresAt: sessions[0]!.expires_at,
      user: {
        id: u.id,
        email: u.email,
        walletAddress: u.wallet_address,
        createdAt: u.created_at,
      },
    };
  });
}

/** Resolves a bearer token to a user, or null. Runs on every authed request. */
export async function resolveSession(token: string): Promise<User | null> {
  const { rows } = await pool.query<{
    id: string;
    email: string;
    wallet_address: string | null;
    created_at: string;
  }>(
    `SELECT u.id, u.email, u.wallet_address, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.disabled_at IS NULL`,
    [hashSecret(token)],
  );

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    walletAddress: row.wallet_address,
    createdAt: row.created_at,
  };
}

export async function revokeSession(token: string): Promise<void> {
  await pool.query(
    'UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
    [hashSecret(token)],
  );
}

export async function setWalletAddress(userId: string, address: string): Promise<void> {
  await pool.query('UPDATE users SET wallet_address = $1 WHERE id = $2', [address, userId]);
}
