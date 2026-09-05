CREATE TABLE negotiation_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL UNIQUE REFERENCES quotations(id),
  owner_role user_role NOT NULL CHECK (owner_role IN ('sales_rep','sales_manager','finance_operations')),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','forwarded','resolved','cancelled')),
  last_handoff_reason TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX negotiation_cases_owner_status_idx ON negotiation_cases(owner_role,status,updated_at DESC);

CREATE TABLE negotiation_case_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  negotiation_case_id UUID NOT NULL REFERENCES negotiation_cases(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  from_role user_role,
  to_role user_role,
  reason TEXT,
  quotation_version_number INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX negotiation_case_events_case_created_idx ON negotiation_case_events(negotiation_case_id,created_at ASC);

ALTER TABLE quotations ADD COLUMN IF NOT EXISTS owner_display_name TEXT;
UPDATE quotations q SET owner_display_name = u.display_name FROM users u WHERE q.owner_user_id = u.id AND q.owner_display_name IS NULL;
ALTER TABLE quotations ALTER COLUMN owner_user_id DROP NOT NULL;

ALTER TABLE approval_actions ADD COLUMN IF NOT EXISTS actor_display_name TEXT;
UPDATE approval_actions aa SET actor_display_name = u.display_name FROM users u WHERE aa.actor_user_id = u.id AND aa.actor_display_name IS NULL;
ALTER TABLE approval_actions ALTER COLUMN actor_user_id DROP NOT NULL;

ALTER TABLE credit_notes ADD COLUMN IF NOT EXISTS created_by_display_name TEXT;
UPDATE credit_notes cn SET created_by_display_name = u.display_name FROM users u WHERE cn.created_by_user_id = u.id AND cn.created_by_display_name IS NULL;
ALTER TABLE credit_notes ALTER COLUMN created_by_user_id DROP NOT NULL;
ALTER TABLE inventory_adjustments ALTER COLUMN adjusted_by_user_id DROP NOT NULL;
ALTER TABLE admin_configuration_revisions ALTER COLUMN changed_by_user_id DROP NOT NULL;
