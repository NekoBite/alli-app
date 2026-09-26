import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { createOrder, getOrder, listOrders, listProducts } from './service.ts';

const OrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.string().min(1).max(64),
        variantId: z.string().min(1).max(16).optional(),
        quantity: z.number().int().positive().max(20),
      }),
    )
    .min(1)
    .max(30),
  method: z.enum(['ALLI', 'USDT']),
  address: z.object({
    fullName: z.string().min(1).max(120),
    line1: z.string().min(1).max(200),
    line2: z.string().max(200).optional(),
    city: z.string().min(1).max(120),
    postcode: z.string().min(1).max(20),
    country: z.string().min(2).max(56),
    phone: z.string().min(4).max(40),
  }),
});

export async function marketRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/market/products', async () => listProducts());

  app.get('/v1/market/orders', {
    preHandler: requireUser,
    handler: async (request) => listOrders(currentUser(request).id),
  });

  app.get('/v1/market/orders/:id', {
    preHandler: requireUser,
    handler: async (request) => {
      const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
      return getOrder(currentUser(request).id, id);
    },
  });

  app.post('/v1/market/orders', {
    preHandler: requireUser,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (request) => createOrder(currentUser(request).id, OrderSchema.parse(request.body)),
  });
}
