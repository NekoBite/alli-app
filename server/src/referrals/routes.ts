import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { attribute, downline, hub, programDetail } from './service.ts';

const Program = z.object({ program: z.enum(['run', 'garden', 'market', 'card']) });

/** Referral programs (docs/referral-programs.md, wireframes 6.1–6.7). */
export async function referralRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/referrals', {
    preHandler: requireUser,
    handler: async (request) => hub(currentUser(request).id),
  });

  app.post('/v1/referrals/attribute', {
    preHandler: requireUser,
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { code } = z.object({ code: z.string().regex(/^[A-Za-z]{3}-[A-Za-z0-9]{6}$/) }).parse(request.body);
      return attribute(currentUser(request).id, code);
    },
  });

  app.get('/v1/referrals/:program', {
    preHandler: requireUser,
    handler: async (request) => programDetail(currentUser(request).id, Program.parse(request.params).program),
  });

  app.get('/v1/referrals/:program/downline', {
    preHandler: requireUser,
    handler: async (request) => downline(currentUser(request).id, Program.parse(request.params).program),
  });
}
