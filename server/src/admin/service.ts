import { pool, transaction, type Db } from '../db/pool.ts';
import { requestLoginCode } from '../auth/service.ts';
import { ApiError } from '../lib/errors.ts';
import { ratesAt, rateHistory, setRates } from '../referrals/rates.ts';
import { PROGRAM_ORDER, type ReferralProgramId } from '../shared/commerce.ts';
import { GOLD_UNLOCK_KEY, goldUnlockRequirement } from './settings.ts';
import type { AdminRole } from './permissions.ts';

export type Actor = { id: string; email: string | null };

async function audit(db: Db, actor: Actor, action: string, targetId: string | null, detail: Record<string, unknown>) {
  await db.query(
    'INSERT INTO admin_audit (actor_id, actor_email, action, target_id, detail) VALUES ($1, $2, $3, $4, $5)',
    [actor.id, actor.email, action, targetId, JSON.stringify(detail)],
  );
}

export type AdminUserRow = {
  id: string;
  email: string | null;
  displayName: string | null;
  adminRole: AdminRole | null;
  disabled: boolean;
  createdAt: string;
  sparkles: number;
  runCredits: number;
};

const SELECT_USER = `
  SELECT u.id, u.email, u.display_name, u.admin_role, u.disabled_at, u.created_at,
         COALESCE((SELECT sum(delta) FROM star_ledger WHERE user_id = u.id), 0)::bigint AS sparkles,
         COALESCE((SELECT sum(delta) FROM credit_ledger WHERE user_id = u.id), 0)::bigint AS run_credits
    FROM users u`;

type Raw = {
  id: string; email: string | null; display_name: string | null; admin_role: AdminRole | null;
  disabled_at: Date | null; created_at: Date; sparkles: string; run_credits: string;
};
const toRow = (r: Raw): AdminUserRow => ({
  id: r.id,
  email: r.email,
  displayName: r.display_name,
  adminRole: r.admin_role,
  disabled: r.disabled_at !== null,
  createdAt: r.created_at.toISOString(),
  sparkles: Number(r.sparkles),
  runCredits: Number(r.run_credits),
});

export async function listUsers(search: string | undefined, limit: number, offset: number): Promise<AdminUserRow[]> {
  const like = search ? `%${search.replace(/[%_\\]/g, '\\$&')}%` : null;
  const { rows } = await pool.query<Raw>(
    `${SELECT_USER}
      WHERE ($1::text IS NULL OR u.email ILIKE $1 OR u.display_name ILIKE $1)
      ORDER BY u.created_at DESC, u.id LIMIT $2 OFFSET $3`,
    [like, limit, offset],
  );
  return rows.map(toRow);
}

export async function getUser(id: string): Promise<AdminUserRow> {
  const { rows } = await pool.query<Raw>(`${SELECT_USER} WHERE u.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('user_not_found', 'No such account.');
  return toRow(rows[0]);
}

export async function renameUser(actor: Actor, id: string, displayName: string): Promise<void> {
  await transaction(async (db) => {
    const { rows } = await db.query<{ display_name: string | null }>(
      'SELECT display_name FROM users WHERE id = $1 FOR UPDATE',
      [id],
    );
    if (!rows[0]) throw ApiError.notFound('user_not_found', 'No such account.');
    await db.query('UPDATE users SET display_name = $2 WHERE id = $1', [id, displayName]);
    await audit(db, actor, 'user.rename', id, { from: rows[0].display_name, to: displayName });
  });
}

/**
 * The password-change link, as ALLI has it: accounts have no passwords, so what a user who is locked
 * out needs is a fresh sign-in code at their address. Same limits as a user asking for one.
 */
export async function sendSignIn(actor: Actor, id: string): Promise<void> {
  const { rows } = await pool.query<{ email: string | null; disabled_at: Date | null }>(
    'SELECT email, disabled_at FROM users WHERE id = $1',
    [id],
  );
  const user = rows[0];
  if (!user) throw ApiError.notFound('user_not_found', 'No such account.');
  if (!user.email) throw ApiError.badRequest('no_email', 'This account has no email address to send to.');
  if (user.disabled_at) throw ApiError.conflict('account_disabled', 'This account is disabled.');
  await requestLoginCode(user.email);
  await pool.query(
    'INSERT INTO admin_audit (actor_id, actor_email, action, target_id) VALUES ($1, $2, $3, $4)',
    [actor.id, actor.email, 'user.send_signin', id],
  );
}

export async function createAccount(actor: Actor, email: string, displayName: string | undefined, role: AdminRole | null) {
  return transaction(async (db) => {
    const normalized = email.trim().toLowerCase();
    const { rows } = await db.query<{ id: string }>(
      `INSERT INTO users (email, display_name, admin_role) VALUES ($1, $2, $3)
       ON CONFLICT (lower(email)) DO NOTHING RETURNING id`,
      [normalized, displayName ?? null, role],
    );
    if (!rows[0]) throw ApiError.conflict('email_taken', 'An account with that email already exists.');
    await audit(db, actor, 'account.create', rows[0].id, { email: normalized, role });
    return rows[0].id;
  });
}

/** Grants, changes or (null) removes a role. The last super admin can never be removed. */
export async function setRole(actor: Actor, id: string, role: AdminRole | null): Promise<void> {
  await transaction(async (db) => {
    await db.query(`SELECT pg_advisory_xact_lock(hashtext('admin_roles'))`);
    const { rows } = await db.query<{ admin_role: AdminRole | null }>('SELECT admin_role FROM users WHERE id = $1', [id]);
    if (!rows[0]) throw ApiError.notFound('user_not_found', 'No such account.');
    const before = rows[0].admin_role;
    if (before === 'super' && role !== 'super') {
      const { rows: n } = await db.query<{ n: string }>(`SELECT count(*) AS n FROM users WHERE admin_role = 'super'`);
      if (Number(n[0]!.n) <= 1) throw ApiError.conflict('last_super_admin', 'There must always be at least one super admin.');
    }
    await db.query('UPDATE users SET admin_role = $2 WHERE id = $1', [id, role]);
    await audit(db, actor, 'account.set_role', id, { from: before, to: role });
  });
}

const MAX_ADJUST = 1_000_000_00; // 1,000,000 stars in sparkles; a typo guard, not a business rule

/** Credits or debits stars (in sparkles). A debit may not take the balance below zero. */
export async function adjustSparkles(actor: Actor, id: string, delta: number, reason: string): Promise<number> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_ADJUST) {
    throw ApiError.badRequest('invalid_amount', 'Give a whole, non-zero number of sparkles within limits.');
  }
  return transaction(async (db) => {
    const { rows } = await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw ApiError.notFound('user_not_found', 'No such account.');
    const { rows: b } = await db.query<{ bal: string }>(
      'SELECT COALESCE(sum(delta), 0)::bigint AS bal FROM star_ledger WHERE user_id = $1',
      [id],
    );
    const balance = Number(b[0]!.bal);
    if (balance + delta < 0) throw ApiError.conflict('insufficient_balance', 'That would take the balance below zero.');
    await db.query(
      `INSERT INTO star_ledger (user_id, delta, reason, day, note) VALUES ($1, $2, 'adjustment', CURRENT_DATE, $3)`,
      [id, delta, `Admin: ${reason}`],
    );
    await audit(db, actor, 'balance.stars', id, { delta, reason, before: balance, after: balance + delta });
    return balance + delta;
  });
}

/** Credits or debits run rounds. A debit may not take the credit below zero. */
export async function adjustRunCredits(actor: Actor, id: string, delta: number, reason: string): Promise<number> {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 100_000) {
    throw ApiError.badRequest('invalid_amount', 'Give a whole, non-zero number of rounds within limits.');
  }
  return transaction(async (db) => {
    const { rows } = await db.query('SELECT 1 FROM users WHERE id = $1 FOR UPDATE', [id]);
    if (!rows[0]) throw ApiError.notFound('user_not_found', 'No such account.');
    const { rows: b } = await db.query<{ bal: string }>(
      'SELECT COALESCE(sum(delta), 0)::bigint AS bal FROM credit_ledger WHERE user_id = $1',
      [id],
    );
    const balance = Number(b[0]!.bal);
    if (balance + delta < 0) throw ApiError.conflict('insufficient_balance', 'That would take the rounds below zero.');
    await db.query(`INSERT INTO credit_ledger (user_id, delta, reason) VALUES ($1, $2, 'adjustment')`, [id, delta]);
    await audit(db, actor, 'balance.runs', id, { delta, reason, before: balance, after: balance + delta });
    return balance + delta;
  });
}

/**
 * Changes a program's commission rates from this moment on. The effective time is the server's
 * clock, never the caller's: a rate change cannot be back-dated or scheduled, and commissions
 * already booked keep the rate they were booked at.
 *
 * `expectedCurrent` guards two admins editing the same screen: the change is refused if the rates
 * in force are no longer the ones the admin was looking at.
 */
export async function changeRates(
  actor: Actor,
  program: ReferralProgramId,
  ratesBps: readonly number[],
  reason: string,
  expectedCurrent?: readonly number[],
): Promise<void> {
  if (!PROGRAM_ORDER.includes(program)) throw ApiError.badRequest('unknown_program', 'Unknown program.');
  await transaction(async (db) => {
    const now = Date.now();
    const current = await ratesAt(db, program, now);
    if (expectedCurrent && (current.length !== expectedCurrent.length || current.some((r, i) => r !== expectedCurrent[i]))) {
      throw ApiError.conflict('rates_changed', 'The rates changed while you were editing. Reload and try again.');
    }
    await setRates({ program, ratesBps, effectiveFrom: now, setBy: actor.email ?? actor.id, note: reason }, db);
    await audit(db, actor, 'rates.change', null, { program, from: current, to: ratesBps, reason });
  });
}

export { rateHistory };

export async function auditLog(limit: number, offset: number, targetId?: string) {
  const { rows } = await pool.query(
    `SELECT id, actor_id, actor_email, action, target_id, detail, created_at FROM admin_audit
      WHERE ($3::uuid IS NULL OR target_id = $3)
      ORDER BY created_at DESC, id LIMIT $1 OFFSET $2`,
    [limit, offset, targetId ?? null],
  );
  return rows.map((r) => ({
    id: r.id as string,
    actorId: r.actor_id as string | null,
    actorEmail: r.actor_email as string | null,
    action: r.action as string,
    targetId: r.target_id as string | null,
    detail: r.detail as Record<string, unknown>,
    createdAt: (r.created_at as Date).toISOString(),
  }));
}

/** Changes how many Silver directs unlock Gold. Applies to purchases quoted from now on. */
export async function changeGoldUnlock(actor: Actor, required: number, reason: string): Promise<void> {
  await transaction(async (db) => {
    const before = await goldUnlockRequirement(db);
    await db.query(
      `INSERT INTO app_settings (key, value, updated_by) VALUES ($1, to_jsonb($2::int), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [GOLD_UNLOCK_KEY, required, actor.email ?? actor.id],
    );
    await audit(db, actor, 'settings.gold_unlock', null, { from: before, to: required, reason });
  });
}
