import type { FastifyInstance } from 'fastify';

import { ApiError } from '../lib/errors.ts';
import { RequestCodeSchema, VerifyCodeSchema, WalletSchema } from '../run/schemas.ts';
import { currentUser, requireUser } from './middleware.ts';
import { requestLoginCode, revokeSession, setWalletAddress, verifyLoginCode } from './service.ts';

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/v1/auth/request-code', {
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (request, reply) => {
      const { email } = RequestCodeSchema.parse(request.body);
      try {
        await requestLoginCode(email);
      } catch (error) {
        // A rate limit must not reveal whether the address has an account.
        // Everything else is a real fault and should surface.
        if (error instanceof ApiError && error.status === 429) {
          return reply.code(204).send();
        }
        throw error;
      }
      return reply.code(204).send();
    },
  });

  app.post('/v1/auth/verify-code', {
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { email, code } = VerifyCodeSchema.parse(request.body);
      const session = await verifyLoginCode(email, code, request.headers['user-agent']);
      return session;
    },
  });

  app.post('/v1/auth/logout', {
    preHandler: requireUser,
    handler: async (request, reply) => {
      if (request.sessionToken) await revokeSession(request.sessionToken);
      return reply.code(204).send();
    },
  });

  app.get('/v1/auth/me', {
    preHandler: requireUser,
    handler: async (request) => currentUser(request),
  });

  /** The address redemptions pay out to. Set once the wallet exists on device. */
  app.put('/v1/auth/wallet', {
    preHandler: requireUser,
    handler: async (request) => {
      const { address } = WalletSchema.parse(request.body);
      const user = currentUser(request);
      await setWalletAddress(user.id, address);
      return { ...user, walletAddress: address };
    },
  });
}
