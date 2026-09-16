import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { authRoutes } from './auth/routes.ts';
import { relayerStatus } from './chain/relayer.ts';
import { env, isProduction } from './config/env.ts';
import { joggingRoutes } from './jogging/routes.ts';
import { ApiError } from './lib/errors.ts';

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: isProduction ? 'info' : 'debug',
      redact: {
        // These are the two values that must never reach a log aggregator.
        paths: ['req.headers.authorization', 'req.body.code'],
        remove: true,
      },
    },
    // Tracks are large; the ceiling still has to exist so one request cannot
    // exhaust memory.
    bodyLimit: 8 * 1024 * 1024,
    trustProxy: true,
  });

  await app.register(rateLimit, {
    global: false,
    // Per authenticated user where possible, per IP otherwise: an IP is shared
    // by everyone behind a carrier NAT, which is most of a mobile user base.
    keyGenerator: (request) => request.user?.id ?? request.ip,
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        code: 'invalid_request',
        message: 'Request body failed validation.',
        issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }

    if (error instanceof ApiError) {
      return reply.code(error.status).send({ code: error.code, message: error.message });
    }

    if ((error as { statusCode?: number }).statusCode === 429) {
      return reply.code(429).send({ code: 'rate_limited', message: 'Too many requests.' });
    }

    // Anything unrecognised is a bug. Log it in full; tell the client nothing,
    // since stack traces and driver errors leak schema and dependency detail.
    request.log.error({ err: error }, 'unhandled error');
    return reply.code(500).send({ code: 'internal_error', message: 'Something went wrong.' });
  });

  app.get('/health', async () => ({ status: 'ok' }));

  /**
   * Deliberately unauthenticated and deliberately non-secret: it reports
   * whether redemption is wired up, never the key. Saves an hour of "why does
   * redeem 503" every time someone deploys without the chain env set.
   */
  app.get('/health/ready', async () => {
    const relayer = relayerStatus();
    return {
      status: 'ok',
      environment: env.NODE_ENV,
      attestation: env.ATTESTATION,
      redemption: relayer.configured
        ? { available: true, relayer: relayer.address }
        : { available: false, reason: relayer.reason },
    };
  });

  await app.register(authRoutes);
  await app.register(joggingRoutes);

  return app;
}
