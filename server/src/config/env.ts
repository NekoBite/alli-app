import 'dotenv/config';
import { z } from 'zod';

/**
 * Fail fast and loudly. A server that boots with a missing signing key and only
 * discovers it when the first user redeems has turned a config mistake into an
 * incident.
 */
const Schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8080),
  HOST: z.string().default('0.0.0.0'),

  DATABASE_URL: z.string().url(),

  /** Pepper for hashing session tokens and login codes. 32+ bytes, base64. */
  TOKEN_SECRET: z.string().min(32),

  SESSION_TTL_HOURS: z.coerce.number().int().positive().default(24 * 30),
  AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().default(10),

  /** console prints codes to the log — development only, never production. */
  MAILER: z.enum(['console', 'smtp']).default('console'),
  SMTP_URL: z.string().optional(),
  MAIL_FROM: z.string().default('Alli <no-reply@trilumi.xyz>'),

  /**
   * OAuth sign-in. A provider with no credentials answers 503 for that
   * provider only; the email code keeps working. The client id must be the
   * same one the app was built with, since the code is bound to it.
   */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  FACEBOOK_APP_ID: z.string().optional(),
  FACEBOOK_APP_SECRET: z.string().optional(),
  X_CLIENT_ID: z.string().optional(),
  X_CLIENT_SECRET: z.string().optional(),

  /** Redemption stays refused until all three are set. See chain/relayer.ts. */
  BSC_RPC_URL: z.string().url().optional(),
  ALLI_TOKEN_ADDRESS: z.string().optional(),
  RELAYER_PRIVATE_KEY: z.string().optional(),

  /**
   * Device attestation. `off` accepts every submission and is for local work
   * only — it is the difference between anti-cheat and theatre.
   */
  ATTESTATION: z.enum(['off', 'required']).default('off'),
});

const parsed = Schema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('\n');
  throw new Error(`Invalid environment:\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === 'production';

if (isProduction) {
  if (env.MAILER === 'console') {
    throw new Error('MAILER=console prints login codes to the log. Refusing to run in production.');
  }
  if (env.ATTESTATION === 'off') {
    // Loud, but not fatal: a deployment may legitimately predate the mobile
    // build that supplies attestation tokens.
    console.warn(
      '[config] ATTESTATION=off in production — runs are accepted from any client, ' +
        'including emulators and modified builds.',
    );
  }
}
