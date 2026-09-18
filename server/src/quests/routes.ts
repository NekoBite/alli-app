import type { FastifyInstance } from 'fastify';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { getWeekly } from './service.ts';

export async function questRoutes(app: FastifyInstance): Promise<void> {
  /** Read-only: contributions are counted from actions the server already handles. */
  app.get('/v1/quests/weekly', {
    preHandler: requireUser,
    handler: async (request) => getWeekly(currentUser(request).id),
  });
}
