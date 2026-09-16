import type { FastifyReply, FastifyRequest } from 'fastify';

import { ApiError } from '../lib/errors.ts';
import { resolveSession, type User } from './service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: User;
    sessionToken?: string;
  }
}

function bearer(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/**
 * Attaches the authenticated user, or rejects. Registered as a preHandler on
 * every route that touches a user's points — there is no "optional auth" path
 * into the ledger.
 */
export async function requireUser(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  const token = bearer(request);
  if (!token) throw ApiError.unauthorized();

  const user = await resolveSession(token);
  if (!user) throw ApiError.unauthorized('Your session has expired. Sign in again.');

  request.user = user;
  request.sessionToken = token;
}

/** Narrows `request.user` for handlers that ran behind `requireUser`. */
export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw ApiError.unauthorized();
  return request.user;
}
