-- The ledger now counts in sparkles: one star is a hundred of them.
--
-- A star is worth 1,000 ALLI, which was fine while the only thing that paid
-- was the daily quest, one whole star at a time. The garden pays a fraction of
-- a star a day and prices fertiliser at less than one, and a whole-number
-- ledger cannot hold either. Rather than make the ledger fractional, the unit
-- gets smaller: every stored amount is multiplied by 100 here, and the server
-- divides by 100 at the boundary so every API field and every screen still
-- speaks in stars. `REWARD_RULES.sparklesPerStar` is the single source of that
-- constant on both sides.

UPDATE star_ledger SET delta = delta * 100;
COMMENT ON COLUMN star_ledger.delta IS
  'Sparkles: hundredths of a star. Positive credits, negative debits; balance is SUM(delta).';

ALTER TABLE runs RENAME COLUMN stars_awarded TO sparkles_awarded;
UPDATE runs SET sparkles_awarded = sparkles_awarded * 100;
COMMENT ON COLUMN runs.sparkles_awarded IS
  'Sparkles (hundredths of a star) this run paid: 0 for every run but the one that completed the quest.';

ALTER TABLE redemptions RENAME COLUMN stars TO sparkles;
ALTER TABLE redemptions RENAME CONSTRAINT redemptions_stars_check TO redemptions_sparkles_check;
UPDATE redemptions SET sparkles = sparkles * 100;
COMMENT ON COLUMN redemptions.sparkles IS
  'Sparkles (hundredths of a star) burned for this exchange. Exchanges are still opened in whole stars.';

-- The garden's daily reward will be the next thing to write to the ledger.
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'garden';
