import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { currentUser } from '../auth/middleware.ts';
import { PROGRAM_ORDER } from '../shared/commerce.ts';
import { goldUnlockRequirement } from './settings.ts';
import { requireAdmin } from './middleware.ts';
import { ADMIN_ROLES, ROLE_PERMISSIONS, can, type AdminRole } from './permissions.ts';
import {
  adjustRunCredits, adjustSparkles, auditLog, changeGoldUnlock, changeRates, createAccount, getUser, listUsers,
  rateHistory, renameUser, sendSignIn, setRole,
} from './service.ts';

const Id = z.object({ id: z.string().uuid() });
const Page = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
const Reason = z.string().trim().min(3).max(300);
const Program = z.enum(PROGRAM_ORDER as [string, ...string[]]);

const actor = (request: Parameters<typeof currentUser>[0]) => {
  const u = currentUser(request);
  return { id: u.id, email: u.email };
};

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  // What the signed-in admin may do, so the dashboard can hide buttons it would only be refused.
  app.get('/v1/admin/me', { preHandler: requireAdmin('view') }, async (request) => {
    const role = request.adminRole!;
    return { role, permissions: ROLE_PERMISSIONS[role], canChangeRates: can(role, 'change_rates') };
  });

  app.get('/v1/admin/users', { preHandler: requireAdmin('view') }, async (request) => {
    const { limit, offset } = Page.parse(request.query);
    const { q } = z.object({ q: z.string().trim().max(100).optional() }).parse(request.query);
    return { users: await listUsers(q || undefined, limit, offset) };
  });

  app.get('/v1/admin/users/:id', { preHandler: requireAdmin('view') }, async (request) => {
    const { id } = Id.parse(request.params);
    return getUser(id);
  });

  app.patch('/v1/admin/users/:id', { preHandler: requireAdmin('edit_profile') }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const { displayName } = z.object({ displayName: z.string().trim().min(1).max(80) }).parse(request.body);
    await renameUser(actor(request), id, displayName);
    return reply.code(204).send();
  });

  app.post('/v1/admin/users/:id/send-signin', {
    preHandler: requireAdmin('send_signin'),
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
  }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    await sendSignIn(actor(request), id);
    return reply.code(204).send();
  });

  app.post('/v1/admin/users', { preHandler: requireAdmin('manage_accounts') }, async (request, reply) => {
    const body = z.object({
      email: z.string().trim().email().max(254),
      displayName: z.string().trim().min(1).max(80).optional(),
      role: z.enum(ADMIN_ROLES).nullable().default(null),
    }).parse(request.body);
    const id = await createAccount(actor(request), body.email, body.displayName, body.role as AdminRole | null);
    return reply.code(201).send({ id });
  });

  app.put('/v1/admin/users/:id/role', { preHandler: requireAdmin('manage_accounts') }, async (request, reply) => {
    const { id } = Id.parse(request.params);
    const { role } = z.object({ role: z.enum(ADMIN_ROLES).nullable() }).parse(request.body);
    await setRole(actor(request), id, role as AdminRole | null);
    return reply.code(204).send();
  });

  app.post('/v1/admin/users/:id/adjust-stars', { preHandler: requireAdmin('adjust_balances') }, async (request) => {
    const { id } = Id.parse(request.params);
    const { sparkles, reason } = z.object({ sparkles: z.number().int(), reason: Reason }).parse(request.body);
    return { sparkles: await adjustSparkles(actor(request), id, sparkles, reason) };
  });

  app.post('/v1/admin/users/:id/adjust-runs', { preHandler: requireAdmin('adjust_balances') }, async (request) => {
    const { id } = Id.parse(request.params);
    const { rounds, reason } = z.object({ rounds: z.number().int(), reason: Reason }).parse(request.body);
    return { runCredits: await adjustRunCredits(actor(request), id, rounds, reason) };
  });

  app.get('/v1/admin/rates/:program/history', { preHandler: requireAdmin('view') }, async (request) => {
    const { program } = z.object({ program: Program }).parse(request.params);
    return { history: await rateHistory(program as never) };
  });

  // No effective date in the body, on purpose: a change applies from the moment it is accepted.
  app.put('/v1/admin/rates/:program', { preHandler: requireAdmin('change_rates') }, async (request, reply) => {
    const { program } = z.object({ program: Program }).parse(request.params);
    const body = z.object({
      ratesBps: z.array(z.number().int()).min(1).max(8),
      reason: Reason,
      expectedCurrent: z.array(z.number().int()).optional(),
    }).strict().parse(request.body);
    await changeRates(actor(request), program as never, body.ratesBps, body.reason, body.expectedCurrent);
    return reply.code(204).send();
  });

  app.get('/v1/admin/settings', { preHandler: requireAdmin('view') }, async () => ({
    goldUnlockSilverDirects: await goldUnlockRequirement(),
  }));

  app.put('/v1/admin/settings/gold-unlock', { preHandler: requireAdmin('change_rates') }, async (request, reply) => {
    const { required, reason } = z.object({ required: z.number().int().min(0).max(100), reason: Reason }).strict().parse(request.body);
    await changeGoldUnlock(actor(request), required, reason);
    return reply.code(204).send();
  });

  app.get('/v1/admin/audit', { preHandler: requireAdmin('view') }, async (request) => {
    const { limit, offset } = Page.parse(request.query);
    const { target } = z.object({ target: z.string().uuid().optional() }).parse(request.query);
    return { entries: await auditLog(limit, offset, target) };
  });
}
