-- Loyalty tier progression. A customer starts without a tier; tiers are earned
-- from paid history unless an administrator explicitly overrides the result.
ALTER TABLE customers ALTER COLUMN tier_id DROP NOT NULL;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_assignment_source TEXT NOT NULL DEFAULT 'automatic'
  CHECK (tier_assignment_source IN ('automatic', 'admin_override'));
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_assigned_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tier_override_reason TEXT;

ALTER TABLE customer_tiers ADD COLUMN IF NOT EXISTS qualification_spend NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (qualification_spend >= 0);
ALTER TABLE customer_tiers ADD COLUMN IF NOT EXISTS qualification_order_count INTEGER NOT NULL DEFAULT 0 CHECK (qualification_order_count >= 0);

CREATE TABLE IF NOT EXISTS customer_tier_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  previous_tier_id UUID REFERENCES customer_tiers(id),
  new_tier_id UUID REFERENCES customer_tiers(id),
  assignment_source TEXT NOT NULL CHECK (assignment_source IN ('automatic', 'admin_override')),
  reason TEXT,
  assigned_by_user_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_tier_history_customer_idx ON customer_tier_history (customer_id, created_at DESC);
