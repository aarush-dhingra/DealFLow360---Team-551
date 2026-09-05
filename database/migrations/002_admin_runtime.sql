CREATE TABLE IF NOT EXISTS schema_migrations (
  filename TEXT PRIMARY KEY,
  checksum TEXT NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auth_sessions_active_idx ON auth_sessions(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE inventory_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  product_id UUID NOT NULL REFERENCES products(id),
  delta_quantity NUMERIC(19,4) NOT NULL CHECK (delta_quantity <> 0),
  reason TEXT NOT NULL,
  adjusted_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE upsell_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger_product_id UUID NOT NULL REFERENCES products(id),
  suggested_product_id UUID NOT NULL REFERENCES products(id),
  rule_kind TEXT NOT NULL CHECK (rule_kind IN ('upsell', 'cross_sell')),
  rank_weight INTEGER NOT NULL DEFAULT 0,
  promotion_tag TEXT,
  minimum_margin_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (minimum_margin_percent BETWEEN 0 AND 100),
  active_from TIMESTAMPTZ,
  active_to TIMESTAMPTZ,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (trigger_product_id <> suggested_product_id),
  CHECK (active_to IS NULL OR active_from IS NULL OR active_to > active_from)
);

CREATE TABLE admin_configuration_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  configuration_kind TEXT NOT NULL,
  configuration_id UUID NOT NULL,
  version INTEGER NOT NULL,
  changed_by_user_id UUID NOT NULL REFERENCES users(id),
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (configuration_kind, configuration_id, version)
);
