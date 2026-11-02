import type { FastifyReply, FastifyRequest } from 'fastify';

import { requireUser } from '../auth/middleware.ts';
import { pool } from '../db/pool.ts';
import { ApiError } from '../lib/errors.ts';
import { can, type AdminRole, type Permission } from './permissions.ts';

declare module 'fastify' {
  interface FastifyRequest {
    adminRole?: AdminRole;
  }
}

/**
 * Signed-in AND holding a role that carries `permission`. The role is read from the database on
 * every request, never from the session: demoting an admin takes effect on their next click, not
 * when their token expires.
 */
export function requireAdmin(permission: Permission) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireUser(request, reply);
    const { rows } = await pool.query<{ admin_role: AdminRole | null }>('SELECT admin_role FROM users WHERE id = $1', [
      request.user!.id,
    ]);
    const role = rows[0]?.admin_role ?? null;
    // 403 either way, with one message: a non-admin learns nothing about which roles exist.
    if (!role || !can(role, permission)) throw ApiError.forbidden('forbidden', 'You do not have access to this.');
    request.adminRole = role;
  };
}
