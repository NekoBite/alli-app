import type { FastifyInstance } from 'fastify';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { assertRedemptionAvailable, sendAlli } from '../chain/relayer.ts';
import { env } from '../config/env.ts';
import { ApiError } from '../lib/errors.ts';
import { DayQuerySchema, RedeemSchema, SubmitRunSchema } from './schemas.ts';
import {
  failRedemption,
  getProfile,
  listRuns,
  openRedemption,
  settleRedemption,
  submitRun,
} from './service.ts';

export async function joggingRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/jogging/profile', {
    preHandler: requireUser,
    handler: async (request) => {
      const { day } = DayQuerySchema.parse(request.query);
      return getProfile(currentUser(request).id, day);
    },
  });

  app.get('/v1/jogging/runs', {
    preHandler: requireUser,
    handler: async (request) => listRuns(currentUser(request).id),
  });

  app.post('/v1/jogging/runs', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => {
      const input = SubmitRunSchema.parse(request.body);

      if (env.ATTESTATION === 'required' && !input.attestation) {
        throw ApiError.forbidden(
          'attestation_required',
          'This build cannot submit runs. Update the app from the store.',
        );
      }
      // TODO: verify input.attestation against Play Integrity / App Attest.
      // Presence is checked; authenticity is not, so this is not yet a defence.

      return submitRun(currentUser(request).id, input);
    },
  });

  app.post('/v1/jogging/redeem', {
    preHandler: requireUser,
    config: { rateLimit: { max: 10, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { points, toAddress, day } = RedeemSchema.parse(request.body);
      const user = currentUser(request);

      // Checked before any points move. If the chain side is not ready, the
      // user keeps their points and gets a straight answer.
      assertRedemptionAvailable();

      const { redemptionId, alli } = await openRedemption({
        userId: user.id,
        points,
        toAddress,
        day,
      });

      try {
        const { hash } = await sendAlli(toAddress, alli.toString());
        await settleRedemption(redemptionId, hash);
        return { txHash: hash, alli };
      } catch (error) {
        // The points are given back here. If the process dies before this runs,
        // the row is left `pending` for the reconciler — which is why the debit
        // and the transfer are deliberately not in one transaction.
        await failRedemption(redemptionId, (error as Error).message);
        throw error;
      }
    },
  });
}
