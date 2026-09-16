import { z } from 'zod';

/**
 * A GPS fix, as the phone recorded it.
 *
 * Bounds are enforced here rather than trusted: latitude outside ±90 or a
 * timestamp in the far future is not a fix, it is someone poking the endpoint.
 */
export const GeoPointSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timestamp: z.number().int().positive(),
  accuracy: z.number().nonnegative().optional(),
  speed: z.number().optional(),
  altitude: z.number().optional(),
});

/** ~5 hours at one fix a second. Past this the payload is abuse, not a marathon. */
const MAX_TRACK_POINTS = 20_000;

export const SubmitRunSchema = z.object({
  clientRunId: z.string().min(1).max(128),
  startedAt: z.number().int().positive(),
  endedAt: z.number().int().positive().optional(),
  track: z.array(GeoPointSchema).max(MAX_TRACK_POINTS),
  steps: z.number().int().nonnegative().max(500_000).optional(),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'day must be YYYY-MM-DD'),
  /** Play Integrity / App Attest token. Required when ATTESTATION=required. */
  attestation: z.string().max(8192).optional(),
});

export const RedeemSchema = z.object({
  points: z.number().int().positive(),
  /** Where the ALLI goes. Checksummed on-chain format, validated by ethers later. */
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/, 'toAddress must be a 0x address'),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const DayQuerySchema = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const RequestCodeSchema = z.object({
  email: z.string().email().max(320),
});

export const VerifyCodeSchema = z.object({
  email: z.string().email().max(320),
  code: z.string().regex(/^\d{6}$/),
});

export const WalletSchema = z.object({
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
