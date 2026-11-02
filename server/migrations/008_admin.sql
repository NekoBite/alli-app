-- Back-office administrators. An admin is an ordinary account (same email-code sign-in) that also
-- carries a role; there is no separate credential store to leak or to forget to rotate.
--   super    everything, including commission rates, accounts, roles and balance adjustments
--   admin    secondary: view, rename a user, send a user a sign-in code
--   readonly view only
ALTER TABLE users ADD COLUMN admin_role text CHECK (admin_role IN ('super', 'admin', 'readonly'));
CREATE INDEX users_admin_role_idx ON users (admin_role) WHERE admin_role IS NOT NULL;

-- Append-only record of every back-office write: who, what, to whom, and the before/after.
CREATE TABLE admin_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid        REFERENCES users (id) ON DELETE SET NULL,
  actor_email text,
  action      text        NOT NULL,
  target_id   uuid,
  detail      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_created_idx ON admin_audit (created_at DESC);
CREATE INDEX admin_audit_target_idx ON admin_audit (target_id, created_at DESC);
