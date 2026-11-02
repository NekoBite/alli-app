-- Business rules the client tunes from the back office, one row each. Changes apply from the moment
-- they are written; nothing here is ever evaluated retroactively. Every change is also written to
-- admin_audit by the endpoint that makes it.
CREATE TABLE app_settings (
  key        text PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_by text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
