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
   * Payments (contracts/src/PaymentRouter.sol). Purchases answer 503 until the router, the quote
   * key and the chain are set; the USDT address is needed to sell anything in USDT.
   */
  CHAIN_ID: z.coerce.number().int().positive().default(97),
  PAYMENT_ROUTER_ADDRESS: z.string().optional(),
  USDT_TOKEN_ADDRESS: z.string().optional(),
  QUOTE_SIGNER_PRIVATE_KEY: z.string().optional(),
  /** How long a quote stays payable. Short: a stale price is a free option for the buyer. */
  QUOTE_TTL_SECONDS: z.coerce.number().int().positive().default(600),
  /** Chain watcher cadence for `Paid` events; 0 disables the in-process watcher. */
  PAYMENT_POLL_SECONDS: z.coerce.number().int().min(0).default(15),

  /**
   * When set, star exchanges pay through RewardClaim (a signed voucher the relayer submits with
   * claimFor) instead of a direct transfer from the relayer's float. VOUCHER_SIGNER_PRIVATE_KEY
   * must hold RewardClaim's SIGNER_ROLE; it defaults to the quote key.
   */
  REWARD_CLAIM_ADDRESS: z.string().optional(),
  VOUCHER_SIGNER_PRIVATE_KEY: z.string().optional(),

  /** Display prices for the wallet (GET /v1/wallet/prices). Never used to price a purchase. */
  ALLI_USD_PRICE: z.coerce.number().nonnegative().default(0),
  BNB_USD_PRICE: z.coerce.number().nonnegative().default(0),

  /** Run credits every new account starts with. 0 = the first run needs a membership or a pack. */
  SIGNUP_RUN_CREDITS: z.coerce.number().int().min(0).default(0),

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
