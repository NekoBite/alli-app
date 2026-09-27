import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { createIntent, getIntent } from './service.ts';

const Currency = z.enum(['ALLI', 'USDT']);

export const IntentSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('runs'), runs: z.number().int().positive().max(300), currency: Currency }),
  z.object({ kind: z.literal('membership'), currency: Currency }),
  z.object({ kind: z.literal('seed'), seedId: z.string().min(1).max(64) }),
  z.object({ kind: z.literal('shoe'), tier: z.enum(['silver', 'gold']), currency: Currency }),
  z.object({ kind: z.literal('order'), orderId: z.string().uuid() }),
]);

/**
 * Payment intents (contracts/src/PaymentRouter.sol). The app asks for a quote, pays it on chain,
 * and polls the intent; fulfilment happens when the chain watcher sees the `Paid` event.
 */
export async function paymentRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/payments/intents', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => createIntent(currentUser(request).id, IntentSchema.parse(request.body)),
  });

  app.get('/v1/payments/intents/:id', {
    preHandler: requireUser,
    handler: async (request) => {
      const { id } = z.object({ id: z.string().regex(/^0x[0-9a-fA-F]{64}$/) }).parse(request.params);
      return getIntent(currentUser(request).id, id);
    },
  });
}
