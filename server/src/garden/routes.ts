import type { FastifyInstance } from 'fastify';

import { currentUser, requireUser } from '../auth/middleware.ts';
import { FertiliseSchema, MinigameParamsSchema, PlantSchema, PlotParamsSchema } from './schemas.ts';
import {
  claimPlot,
  completeMinigamePlot,
  fertilisePlot,
  fillSunPlot,
  getGarden,
  plant,
  waterPlot,
} from './service.ts';

/**
 * What the phone does not send: a status level, a tap count, a minigame
 * score, or a star amount. It reports that an action happened; the server
 * decides what it is worth.
 */
export async function gardenRoutes(app: FastifyInstance): Promise<void> {
  app.get('/v1/garden', {
    preHandler: requireUser,
    handler: async (request) => getGarden(currentUser(request).id),
  });

  app.post('/v1/garden/plots', {
    preHandler: requireUser,
    config: { rateLimit: { max: 30, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { seedId, intentId } = PlantSchema.parse(request.body);
      return plant(currentUser(request).id, seedId, Date.now(), intentId);
    },
  });

  app.post('/v1/garden/plots/:id/water', {
    preHandler: requireUser,
    config: { rateLimit: { max: 120, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { id } = PlotParamsSchema.parse(request.params);
      return waterPlot(currentUser(request).id, id);
    },
  });

  app.post('/v1/garden/plots/:id/sun', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { id } = PlotParamsSchema.parse(request.params);
      return fillSunPlot(currentUser(request).id, id);
    },
  });

  app.post('/v1/garden/plots/:id/fertilise', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { id } = PlotParamsSchema.parse(request.params);
      const { kind } = FertiliseSchema.parse(request.body);
      return fertilisePlot(currentUser(request).id, id, kind);
    },
  });

  app.post('/v1/garden/plots/:id/claim', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { id } = PlotParamsSchema.parse(request.params);
      return claimPlot(currentUser(request).id, id);
    },
  });

  app.post('/v1/garden/plots/:id/minigames/:game', {
    preHandler: requireUser,
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
    handler: async (request) => {
      const { id, game } = MinigameParamsSchema.parse(request.params);
      return completeMinigamePlot(currentUser(request).id, id, game);
    },
  });
}
