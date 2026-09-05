-- Account lifecycle: internal users receive a temporary password from an
-- administrator; customer accounts are tied to an existing customer contact.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS users_active_email_idx
  ON users (email) WHERE is_active = TRUE;
