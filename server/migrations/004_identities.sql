-- Sign-in with a provider.
--
-- An account can now be born from Google, Facebook or X instead of an email
-- code. X does not hand out an email address, so `users.email` becomes
-- nullable: an X-only account has an identity row and no email until the user
-- adds one. The functional unique index on lower(email) still holds for the
-- rows that have one; NULLs are distinct to a unique index.

ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ADD COLUMN display_name text;

CREATE TABLE identities (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  provider         text NOT NULL CHECK (provider IN ('google', 'facebook', 'x')),
  -- The provider's stable id for the person (Google sub, Facebook app-scoped
  -- id, X user id). Never the email: an email can move between accounts.
  provider_user_id text NOT NULL,
  -- What the provider said at last sign-in, for display and for linking; not
  -- a login key.
  email            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  last_signed_in   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (provider, provider_user_id)
);

CREATE INDEX identities_user_idx ON identities (user_id);
