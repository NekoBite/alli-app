-- The reward became a daily quest paid in stars.
--
-- 001 was written when a run earned points per kilometre. The rule is now
-- "6,000 GPS-verified steps in a day pays one star, multiplied by the NFT
-- footwear tier", so the ledger holds stars and the runs table records what a
-- run contributed. Renaming rather than adding keeps one ledger: two would
-- mean two balances to reconcile, and the first symptom of that is a user
-- shown one number and paid another.

ALTER TABLE points_ledger RENAME TO star_ledger;
ALTER INDEX points_ledger_run_key RENAME TO star_ledger_run_key;
ALTER INDEX points_ledger_user_idx RENAME TO star_ledger_user_idx;
ALTER INDEX points_ledger_user_day_idx RENAME TO star_ledger_user_day_idx;

-- Stars awarded by this run: 0 for every run but the one that completes the
-- day's quest. Kept on the run so "which run paid" has an answer.
ALTER TABLE runs RENAME COLUMN points_awarded TO stars_awarded;

-- The steps the server credited after re-running them against the track. The
-- column already existed for the raw count; it now holds the credited one,
-- which is the number the quest is judged on.
COMMENT ON COLUMN runs.steps IS
  'GPS-credited steps, recomputed server-side from the raw pedometer samples.';

ALTER TABLE redemptions RENAME COLUMN points TO stars;
ALTER TABLE redemptions RENAME CONSTRAINT redemptions_points_check TO redemptions_stars_check;

-- The NFT footwear tier, issued free at registration and multiplying what the
-- daily quest pays. Server-side because a multiplier the phone can set is a
-- multiplier the phone can set to 1000.
ALTER TABLE users ADD COLUMN shoe_tier text NOT NULL DEFAULT 'leather';
ALTER TABLE users ADD CONSTRAINT users_shoe_tier_check
  CHECK (shoe_tier IN ('leather', 'silver', 'gold'));
