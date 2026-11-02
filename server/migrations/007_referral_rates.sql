-- Referral commission rates as data, not constants.
--
-- The client will tune these, and the old system changed ALLI RUN's Gen 1 rate from 40% to 20% around
-- 1 Nov 2026 without a release. A rate lives here with the date it takes effect; code defaults
-- (src/features/referrals/rules.ts) apply until a set exists.
--
-- A "rate set" is every row sharing (program, effective_from): one row per paying generation, which
-- must be 1..n with no gaps (enforced where sets are written, server/src/referrals/rates.ts). The set
-- in force at a moment is the one with the latest effective_from not after it.
--
-- Append-only by convention: nothing updates or deletes a row. A mistake is corrected by writing a
-- new set from now. Commissions never change retroactively, because each records the rate it was
-- booked at (commissions.rate_bps).

CREATE TABLE referral_rates (
  id             bigserial   PRIMARY KEY,
  program        text        NOT NULL CHECK (program IN ('run', 'garden', 'market', 'card')),
  generation     int         NOT NULL CHECK (generation BETWEEN 1 AND 8),
  -- Basis points of the commissionable amount: 2000 = 20%.
  rate_bps       int         NOT NULL CHECK (rate_bps BETWEEN 0 AND 10000),
  effective_from timestamptz NOT NULL,
  -- Who set it and why, for the question "who changed this rate?" that nobody could answer about
  -- the old system.
  set_by         text,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (program, generation, effective_from)
);

CREATE INDEX referral_rates_lookup_idx ON referral_rates (program, effective_from DESC);

-- The rate each commission was booked at. NULL only for rows that predate this migration.
ALTER TABLE commissions ADD COLUMN rate_bps int CHECK (rate_bps BETWEEN 0 AND 10000);
