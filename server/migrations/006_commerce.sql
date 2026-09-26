-- Commerce: run credits and membership, payment intents, market orders, and the per-feature
-- referral programs (docs/referral-programs.md).
--
-- Same rule as the star ledger: balances are sums over append-only rows, never a column someone
-- can overwrite, so "where did my runs / my commission go" always has an answer.

-- Stars back on ALLI market orders (src/features/market/rules.ts) are paid into the star ledger.
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'order';

-- Run credits. +N from a membership renewal or a pack, -1 per recorded run. `month` is the
-- server's calendar month, the bucket the extra-purchase ceiling is counted in.
CREATE TABLE credit_ledger (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  delta       int         NOT NULL CHECK (delta <> 0),
  reason      text        NOT NULL CHECK (reason IN ('membership', 'pack', 'run', 'signup', 'adjustment')),
  run_id      uuid        REFERENCES runs (id) ON DELETE SET NULL,
  intent_id   text,
  month       date        NOT NULL DEFAULT date_trunc('month', now())::date,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX credit_ledger_user_idx ON credit_ledger (user_id, created_at DESC);
-- A run spends its credit once, however often the upload is retried.
CREATE UNIQUE INDEX credit_ledger_run_key ON credit_ledger (run_id) WHERE run_id IS NOT NULL;
-- A payment grants its credits once, however often the watcher sees the event.
CREATE UNIQUE INDEX credit_ledger_intent_key ON credit_ledger (intent_id) WHERE intent_id IS NOT NULL;

CREATE TABLE memberships (
  user_id      uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  active_until timestamptz NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Server-quoted payments (contracts/src/PaymentRouter.sol). The signed quote is kept so a
-- dispute can be replayed against the chain. Amounts are raw token units: NUMERIC(78,0) holds
-- any uint256.
CREATE TABLE payment_intents (
  id           text PRIMARY KEY CHECK (id ~ '^0x[0-9a-f]{64}$'),
  user_id      uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  kind         text        NOT NULL CHECK (kind IN ('runs', 'membership', 'seed', 'shoe', 'order')),
  symbol       text        NOT NULL CHECK (symbol IN ('ALLI', 'USDT')),
  token        text        NOT NULL,
  payer        text        NOT NULL,
  amount       numeric(78, 0) NOT NULL CHECK (amount > 0),
  -- What is being bought: { runs } / {} / { seedId } / { tier } / { orderId }.
  ref          jsonb       NOT NULL DEFAULT '{}',
  deadline     timestamptz NOT NULL,
  signature    text        NOT NULL,
  status       text        NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'confirmed', 'expired', 'failed')),
  tx_hash      text,
  -- Set when a seed intent is spent on a planting, so one payment plants one tree.
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz
);

CREATE INDEX payment_intents_user_idx ON payment_intents (user_id, created_at DESC);
CREATE INDEX payment_intents_pending_idx ON payment_intents (created_at) WHERE status = 'pending';

CREATE TABLE orders (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number      text        NOT NULL UNIQUE,
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  method      text        NOT NULL CHECK (method IN ('ALLI', 'USDT')),
  lines       jsonb       NOT NULL,
  -- Human-readable token amounts, as priced from the catalogue at creation.
  subtotal    numeric(38, 6) NOT NULL,
  shipping    numeric(38, 6) NOT NULL,
  total       numeric(38, 6) NOT NULL,
  stars_back  numeric(20, 2) NOT NULL DEFAULT 0,
  address     jsonb       NOT NULL,
  status      text        NOT NULL DEFAULT 'pending-payment'
              CHECK (status IN ('pending-payment', 'paid', 'shipped', 'delivered', 'cancelled')),
  tx_hash     text,
  tracking_number text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  paid_at     timestamptz
);

CREATE INDEX orders_user_idx ON orders (user_id, created_at DESC);

-- Referral programs. One code per member per program, minted on first read.
CREATE TABLE referral_codes (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  program    text NOT NULL CHECK (program IN ('run', 'garden', 'market', 'card')),
  code       text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, program)
);

-- Sponsor per member per program: joining through a Garden link puts you in that Garden team only.
-- Written once (first join wins); cycles and self-referral are refused at write time.
CREATE TABLE sponsorships (
  user_id    uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  program    text NOT NULL CHECK (program IN ('run', 'garden', 'market', 'card')),
  sponsor_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, program),
  CHECK (user_id <> sponsor_id)
);

CREATE INDEX sponsorships_sponsor_idx ON sponsorships (program, sponsor_id);

-- Commission ledger. beneficiary NULL = the ALLI treasury (an unqualified Gen 1 share, or a roll-up
-- that found nobody qualified). `payable_at` holds market commissions until the return window
-- closes; ReferralPayout roots are built from rows whose payable_at has passed.
CREATE TABLE commissions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  program        text        NOT NULL CHECK (program IN ('run', 'garden', 'market', 'card')),
  beneficiary_id uuid        REFERENCES users (id) ON DELETE SET NULL,
  buyer_id       uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  generation     int         NOT NULL CHECK (generation >= 1),
  symbol         text        NOT NULL CHECK (symbol IN ('ALLI', 'USDT')),
  amount         numeric(78, 0) NOT NULL CHECK (amount > 0),
  rolled_up_from uuid        REFERENCES users (id) ON DELETE SET NULL,
  intent_id      text        NOT NULL,
  payable_at     timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  -- One share per generation per purchase, however often fulfilment runs.
  UNIQUE (intent_id, generation)
);

CREATE INDEX commissions_beneficiary_idx ON commissions (beneficiary_id, program);

-- Where the chain watcher stopped scanning, per stream, so a restart resumes instead of rescanning.
CREATE TABLE chain_cursors (
  name  text PRIMARY KEY,
  block bigint NOT NULL
);
