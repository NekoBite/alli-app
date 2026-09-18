-- The garden and the community quest move to the server.
--
-- A plot is stored as the whole care state the shared engine reads and
-- writes (src/features/garden/care.ts), plus the columns worth querying on.
-- The engine is the schema: a column per status would only be a second copy
-- of it that could drift. The star movements the garden causes go through
-- star_ledger like everything else.

CREATE TABLE gardens (
  user_id           uuid PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  -- Carbon score adjustment earned from community quest rewards. Negative is good.
  carbon_adjustment int         NOT NULL DEFAULT 0,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plots (
  id         uuid PRIMARY KEY,
  user_id    uuid        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  seed_id    text        NOT NULL,
  planted_at timestamptz NOT NULL,
  -- The Plot object, exactly as the engine last left it.
  state      jsonb       NOT NULL,
  died_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX plots_user_idx ON plots (user_id, planted_at DESC);

-- Quest rewards are their own ledger reason so a payout can be told from a sparkle.
ALTER TYPE ledger_reason ADD VALUE IF NOT EXISTS 'quest';

-- What each user contributed to each metric in each week. The community
-- total is a SUM over this; the quest itself is chosen by the rotation in
-- src/features/quests/quests.ts until an editor's table replaces it.
CREATE TABLE quest_contributions (
  week_start date   NOT NULL,
  user_id    uuid   NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  metric     text   NOT NULL,
  amount     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (week_start, user_id, metric)
);

CREATE INDEX quest_contributions_week_metric_idx ON quest_contributions (week_start, metric);

-- A closed week: the outcome the community reached, written once.
CREATE TABLE quest_weeks (
  week_start   date PRIMARY KEY,
  quest_id     text        NOT NULL,
  community    bigint      NOT NULL,
  contributors int         NOT NULL,
  outcome      text        NOT NULL CHECK (outcome IN ('none', 'goal', 'stretch')),
  closed_at    timestamptz NOT NULL DEFAULT now()
);

-- What each user got out of a closed week. One row per user per week, which
-- is what makes closing a week idempotent.
CREATE TABLE quest_payouts (
  week_start    date    NOT NULL REFERENCES quest_weeks (week_start) ON DELETE CASCADE,
  user_id       uuid    NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  mine          bigint  NOT NULL,
  qualified     boolean NOT NULL,
  paid_sparkles int     NOT NULL,
  PRIMARY KEY (week_start, user_id)
);
