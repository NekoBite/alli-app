import { z } from 'zod';

export const PlantSchema = z.object({
  seedId: z.string().min(1).max(64),
});

export const PlotParamsSchema = z.object({
  id: z.string().uuid(),
});

export const FertiliseSchema = z.object({
  kind: z.enum(['stars', 'compost', 'synthetic']),
});

export const MinigameParamsSchema = z.object({
  id: z.string().uuid(),
  game: z.enum(['compost', 'mulch', 'haze']),
});
