-- ALLI RUN rewards: identity, the run record, and the points ledger.
--
-- The ledger is the source of truth for points. A balance column would be
-- faster to read and impossible to audit; every credit and debit here is a row,
-- so "why do I have this many points" always has an answer.

CREATE TABLE users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text        NOT NULL,
  -- Lowercased at write time; the unique index below is what actually enforces
  -- it, so Alice@x.com and alice@x.com cannot become two accounts farming one
  -- device.
  wallet_address text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  disabled_at   timestamptz
);

CREATE UNIQUE INDEX users_email_key ON users (lower(email));

-- One-time login codes. Stored hashed: a database leak should not hand an
-- attacker a working login for every pending sign-in.
CREATE TABLE auth_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  code_hash   text        NOT NULL,
  expires_at  timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX auth_codes_user_active_idx
  ON auth_codes (user_id, created_at DESC)
  WHERE consumed_at IS NULL;

-- Opaque session tokens, also stored hashed. Opaque rather than JWT so that
-- revocation is a single UPDATE — a stolen token can be killed immediately,
-- which a self-contained JWT cannot be without extra machinery.
CREATE TABLE sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  token_hash text        NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  user_agent text
);

CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- The id the phone generated. Unique per user so a retried upload credits
  -- once: without this, a flaky connection is a points printer.
  client_run_id   text        NOT NULL,
  started_at      timestamptz NOT NULL,
  ended_at        timestamptz,
  -- Raw, as uploaded. Kept so a disputed run can be recomputed, and so the
  -- anti-cheat rules can be re-run over history when they change.
  track           jsonb       NOT NULL,
  -- Recomputed server-side from `track`. The client's own figures are NOT
  -- stored here; they are a preview and carry no authority.
  distance_metres double precision NOT NULL,
  moving_seconds  double precision NOT NULL,
  rejected_points int         NOT NULL,
  steps           int,
  -- Full RewardBreakdown as returned by calculateReward.
  reward          jsonb       NOT NULL,
  points_awarded  int         NOT NULL,
  -- Denormalised from reward->flags for cheap "show me rejected runs" queries.
  flags           text[]      NOT NULL DEFAULT '{}',
  -- Local calendar day the run counted against, as YYYY-MM-DD. The daily cap is
  -- bucketed by this, not by UTC, so a runner near midnight is not robbed.
  day             date        NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX runs_user_client_run_id_key ON runs (user_id, client_run_id);
CREATE INDEX runs_user_created_idx ON runs (user_id, created_at DESC);
CREATE INDEX runs_user_day_idx ON runs (user_id, day);

CREATE TYPE ledger_reason AS ENUM ('run', 'redemption', 'adjustment');

CREATE TABLE points_ledger (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  -- Positive credits, negative debits. Balance is SUM(delta).
  delta      int           NOT NULL,
  reason     ledger_reason NOT NULL,
  run_id     uuid          REFERENCES runs (id) ON DELETE RESTRICT,
  redemption_id uuid,
  day        date          NOT NULL,
  note       text,
  created_at timestamptz   NOT NULL DEFAULT now(),

  -- A 'run' entry must point at the run it came from, and only one entry may.
  CONSTRAINT ledger_run_has_run_id CHECK (reason <> 'run' OR run_id IS NOT NULL)
);

CREATE UNIQUE INDEX points_ledger_run_key ON points_ledger (run_id) WHERE run_id IS NOT NULL;
CREATE INDEX points_ledger_user_idx ON points_ledger (user_id);
-- Serves the daily-cap query, which runs inside the award transaction and so is
-- on the hot path for every submitted run.
CREATE INDEX points_ledger_user_day_idx ON points_ledger (user_id, day) WHERE reason = 'run';

CREATE TYPE redemption_status AS ENUM ('pending', 'settled', 'failed');

CREATE TABLE redemptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid              NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  points      int               NOT NULL CHECK (points > 0),
  -- ALLI, as a decimal string. Never a float: binary floating point cannot
  -- represent token amounts exactly and this number is money.
  alli_amount numeric(38, 18)   NOT NULL,
  to_address  text              NOT NULL,
  status      redemption_status NOT NULL DEFAULT 'pending',
  -- The ledger day this redemption was booked against, so a refund reverses
  -- the debit in the same bucket rather than on whatever day it happens to run.
  day         date              NOT NULL,
  tx_hash     text,
  failure     text,
  created_at  timestamptz       NOT NULL DEFAULT now(),
  settled_at  timestamptz
);

CREATE INDEX redemptions_user_idx ON redemptions (user_id, created_at DESC);
-- Finds redemptions stuck mid-flight after a crash, for the reconciler.
CREATE INDEX redemptions_pending_idx ON redemptions (created_at) WHERE status = 'pending';
