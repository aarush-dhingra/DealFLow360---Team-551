-- DealFlow360 initial relational schema.
-- All monetary values use NUMERIC; do not replace them with FLOAT/REAL.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('sales_rep', 'sales_manager', 'finance_operations', 'admin', 'customer_portal');
CREATE TYPE quote_status AS ENUM ('draft', 'sent_to_customer', 'under_negotiation', 'pending_manager_approval', 'pending_finance_approval', 'approved', 'customer_confirmed', 'confirmed', 'in_fulfillment', 'partially_fulfilled', 'fulfilled', 'invoiced', 'partially_paid', 'paid', 'rejected', 'returned_for_revision', 'cancelled', 'expired', 'superseded');
CREATE TYPE discount_mode AS ENUM ('line', 'order');
CREATE TYPE approval_status AS ENUM ('pending', 'approved', 'rejected', 'returned_for_revision', 'escalated', 'cancelled', 'superseded');
CREATE TYPE approval_action AS ENUM ('approve', 'reject', 'return_for_revision', 'escalate');
CREATE TYPE negotiation_origin AS ENUM ('internal', 'customer');
CREATE TYPE event_status AS ENUM ('pending', 'processing', 'published', 'failed');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  display_name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  user_id UUID NOT NULL REFERENCES users(id),
  role user_role NOT NULL,
  PRIMARY KEY (user_id, role)
);

CREATE TABLE customer_tiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('gold', 'silver', 'bronze')),
  display_name TEXT NOT NULL,
  entitlement_discount_percent NUMERIC(9,4) NOT NULL CHECK (entitlement_discount_percent BETWEEN 0 AND 100),
  policy_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  tier_id UUID NOT NULL REFERENCES customer_tiers(id),
  currency_code CHAR(3) NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  email TEXT NOT NULL,
  display_name TEXT NOT NULL,
  portal_token_hash TEXT,
  portal_token_expires_at TIMESTAMPTZ,
  portal_token_revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (customer_id, email)
);

CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE CHECK (code IN ('hardware', 'software')),
  display_name TEXT NOT NULL,
  discount_ceiling_percent NUMERIC(9,4) NOT NULL CHECK (discount_ceiling_percent BETWEEN 0 AND 100),
  policy_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category_id UUID NOT NULL REFERENCES product_categories(id),
  description TEXT,
  unit_name TEXT NOT NULL DEFAULT 'unit',
  list_price NUMERIC(19,4) NOT NULL CHECK (list_price >= 0),
  standard_cost NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (standard_cost >= 0),
  tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 100),
  billing_kind TEXT NOT NULL DEFAULT 'one_time' CHECK (billing_kind IN ('one_time', 'recurring')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id),
  sku TEXT NOT NULL UNIQUE,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  extra_price NUMERIC(19,4) NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE price_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  tier_id UUID REFERENCES customer_tiers(id),
  currency_code CHAR(3) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE price_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  price_list_id UUID NOT NULL REFERENCES price_lists(id),
  product_id UUID NOT NULL REFERENCES products(id),
  unit_price NUMERIC(19,4) NOT NULL CHECK (unit_price >= 0),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to > valid_from)
);

CREATE TABLE approval_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_max_blended_risk_percent NUMERIC(9,4) NOT NULL CHECK (manager_max_blended_risk_percent BETWEEN 0 AND 100),
  high_risk_route TEXT NOT NULL CHECK (high_risk_route IN ('manager_then_finance', 'finance_direct')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  policy_version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE deal_health_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_points NUMERIC(9,4) NOT NULL DEFAULT 10,
  turn_points_cap NUMERIC(9,4) NOT NULL DEFAULT 50,
  quote_age_day_points NUMERIC(9,4) NOT NULL DEFAULT 2,
  quote_age_points_cap NUMERIC(9,4) NOT NULL DEFAULT 30,
  inactivity_day_points NUMERIC(9,4) NOT NULL DEFAULT 5,
  inactivity_points_cap NUMERIC(9,4) NOT NULL DEFAULT 20,
  warning_threshold NUMERIC(9,4) NOT NULL DEFAULT 50,
  manager_threshold NUMERIC(9,4) NOT NULL DEFAULT 75,
  finance_threshold NUMERIC(9,4) NOT NULL DEFAULT 90,
  policy_version INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (warning_threshold <= manager_threshold AND manager_threshold <= finance_threshold)
);

CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES customers(id),
  owner_user_id UUID NOT NULL REFERENCES users(id),
  status quote_status NOT NULL DEFAULT 'draft',
  current_version_number INTEGER NOT NULL DEFAULT 1 CHECK (current_version_number > 0),
  lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  closed_by_user_id UUID REFERENCES users(id),
  supersedes_quotation_id UUID REFERENCES quotations(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE quotation_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  created_by_user_id UUID REFERENCES users(id),
  reason TEXT NOT NULL,
  discount_mode discount_mode NOT NULL,
  order_discount_percent NUMERIC(9,4) CHECK (order_discount_percent BETWEEN 0 AND 100),
  currency_code CHAR(3) NOT NULL,
  pre_discount_total NUMERIC(19,4) NOT NULL CHECK (pre_discount_total >= 0),
  discount_total NUMERIC(19,4) NOT NULL CHECK (discount_total >= 0),
  net_total NUMERIC(19,4) NOT NULL CHECK (net_total >= 0),
  tax_total NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  grand_total NUMERIC(19,4) NOT NULL CHECK (grand_total >= 0),
  pricing_snapshot JSONB NOT NULL,
  policy_snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quotation_id, version_number),
  CHECK ((discount_mode = 'order' AND order_discount_percent IS NOT NULL) OR (discount_mode = 'line' AND order_discount_percent IS NULL))
);

CREATE TABLE quotation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_version_id UUID NOT NULL REFERENCES quotation_versions(id),
  line_number INTEGER NOT NULL CHECK (line_number > 0),
  product_id UUID NOT NULL REFERENCES products(id),
  product_variant_id UUID REFERENCES product_variants(id),
  category_id UUID NOT NULL REFERENCES product_categories(id),
  description TEXT NOT NULL,
  quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(19,4) NOT NULL CHECK (unit_price >= 0),
  line_base_value NUMERIC(19,4) NOT NULL CHECK (line_base_value >= 0),
  line_discount_percent NUMERIC(9,4) CHECK (line_discount_percent BETWEEN 0 AND 100),
  allowed_discount_percent NUMERIC(9,4) NOT NULL CHECK (allowed_discount_percent BETWEEN 0 AND 100),
  net_line_value NUMERIC(19,4) NOT NULL CHECK (net_line_value >= 0),
  tax_percent NUMERIC(9,4) NOT NULL DEFAULT 0 CHECK (tax_percent BETWEEN 0 AND 100),
  line_snapshot JSONB NOT NULL,
  UNIQUE (quotation_version_id, line_number)
);

CREATE TABLE risk_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_version_id UUID NOT NULL UNIQUE REFERENCES quotation_versions(id),
  total_pre_discount_order_value NUMERIC(19,4) NOT NULL CHECK (total_pre_discount_order_value > 0),
  total_line_excess_value NUMERIC(19,4) NOT NULL CHECK (total_line_excess_value >= 0),
  blended_risk_percent NUMERIC(9,4) NOT NULL CHECK (blended_risk_percent BETWEEN 0 AND 100),
  route TEXT NOT NULL CHECK (route IN ('none', 'manager', 'manager_then_finance', 'finance_direct')),
  inputs_snapshot JSONB NOT NULL,
  policy_snapshot JSONB NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE risk_assessment_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_assessment_id UUID NOT NULL REFERENCES risk_assessments(id),
  quotation_line_id UUID NOT NULL REFERENCES quotation_lines(id),
  requested_discount_percent NUMERIC(9,4) NOT NULL CHECK (requested_discount_percent BETWEEN 0 AND 100),
  allowed_discount_percent NUMERIC(9,4) NOT NULL CHECK (allowed_discount_percent BETWEEN 0 AND 100),
  line_overage_percent NUMERIC(9,4) NOT NULL CHECK (line_overage_percent >= 0),
  line_base_value NUMERIC(19,4) NOT NULL CHECK (line_base_value >= 0),
  line_excess_value NUMERIC(19,4) NOT NULL CHECK (line_excess_value >= 0),
  UNIQUE (risk_assessment_id, quotation_line_id)
);

CREATE TABLE approval_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  quotation_version_id UUID NOT NULL REFERENCES quotation_versions(id),
  risk_assessment_id UUID REFERENCES risk_assessments(id),
  sequence_number INTEGER NOT NULL CHECK (sequence_number > 0),
  required_role user_role NOT NULL CHECK (required_role IN ('sales_manager', 'finance_operations')),
  status approval_status NOT NULL DEFAULT 'pending',
  assigned_user_id UUID REFERENCES users(id),
  decision_by_user_id UUID REFERENCES users(id),
  decision_reason TEXT,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (quotation_version_id, sequence_number)
);

CREATE TABLE approval_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_instance_id UUID NOT NULL REFERENCES approval_instances(id),
  actor_user_id UUID NOT NULL REFERENCES users(id),
  action approval_action NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE negotiation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  quotation_version_id UUID REFERENCES quotation_versions(id),
  quotation_line_id UUID REFERENCES quotation_lines(id),
  origin negotiation_origin NOT NULL,
  internal_user_id UUID REFERENCES users(id),
  customer_contact_id UUID REFERENCES customer_contacts(id),
  message_text TEXT NOT NULL,
  requested_discount_percent NUMERIC(9,4) CHECK (requested_discount_percent BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((origin = 'internal' AND internal_user_id IS NOT NULL AND customer_contact_id IS NULL) OR (origin = 'customer' AND customer_contact_id IS NOT NULL AND internal_user_id IS NULL))
);

CREATE TABLE deal_health_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  negotiation_turns INTEGER NOT NULL CHECK (negotiation_turns >= 0),
  quote_age_days INTEGER NOT NULL CHECK (quote_age_days >= 0),
  inactivity_days INTEGER NOT NULL CHECK (inactivity_days >= 0),
  score NUMERIC(9,4) NOT NULL CHECK (score BETWEEN 0 AND 100),
  band TEXT NOT NULL CHECK (band IN ('normal', 'warning', 'manager', 'finance')),
  policy_snapshot JSONB NOT NULL,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  shipping_cost_weight NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (shipping_cost_weight >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE inventory_levels (
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  product_id UUID NOT NULL REFERENCES products(id),
  quantity_on_hand NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (quantity_on_hand >= 0),
  quantity_reserved NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (quantity_reserved >= 0),
  reorder_point NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (reorder_point >= 0),
  PRIMARY KEY (warehouse_id, product_id),
  CHECK (quantity_reserved <= quantity_on_hand)
);

CREATE TABLE fulfillment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  status TEXT NOT NULL CHECK (status IN ('planned', 'allocated', 'partially_shipped', 'shipped', 'backordered', 'cancelled')),
  allocation_mode TEXT NOT NULL CHECK (allocation_mode IN ('suggested', 'manual')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE fulfillment_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id),
  quotation_line_id UUID NOT NULL REFERENCES quotation_lines(id),
  warehouse_id UUID NOT NULL REFERENCES warehouses(id),
  quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('allocated', 'backordered', 'shipped', 'cancelled'))
);

CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  interval_unit TEXT NOT NULL CHECK (interval_unit IN ('month', 'quarter', 'year')),
  proration_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  cancellation_policy JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  quotation_line_id UUID REFERENCES quotation_lines(id),
  plan_id UUID NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'paused', 'cancelled', 'expired')),
  started_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE billing_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id),
  due_at TIMESTAMPTZ NOT NULL,
  amount NUMERIC(19,4) NOT NULL CHECK (amount >= 0),
  status TEXT NOT NULL CHECK (status IN ('pending', 'invoiced', 'paid', 'cancelled', 'credited'))
);

CREATE TABLE invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_number TEXT NOT NULL UNIQUE,
  quotation_id UUID NOT NULL REFERENCES quotations(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  currency_code CHAR(3) NOT NULL,
  amount_due NUMERIC(19,4) NOT NULL CHECK (amount_due >= 0),
  amount_paid NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (amount_paid >= 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'credited')),
  due_at TIMESTAMPTZ,
  issued_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (amount_paid <= amount_due)
);

CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  payment_method TEXT NOT NULL,
  external_reference TEXT,
  paid_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE credit_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  amount NUMERIC(19,4) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  created_by_user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  quotation_id UUID REFERENCES quotations(id),
  quotation_version_id UUID REFERENCES quotation_versions(id),
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES users(id),
  actor_customer_contact_id UUID REFERENCES customer_contacts(id),
  request_id UUID,
  before_state JSONB,
  after_state JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE outbox_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  aggregate_type TEXT NOT NULL,
  aggregate_id UUID NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  status event_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX quotations_owner_status_idx ON quotations(owner_user_id, status);
CREATE INDEX quotations_customer_status_idx ON quotations(customer_id, status);
CREATE INDEX quotation_versions_quote_idx ON quotation_versions(quotation_id, version_number DESC);
CREATE INDEX approval_instances_assignee_status_idx ON approval_instances(assigned_user_id, status);
CREATE INDEX approval_instances_version_idx ON approval_instances(quotation_version_id, sequence_number);
CREATE INDEX negotiation_messages_quote_created_idx ON negotiation_messages(quotation_id, created_at);
CREATE INDEX audit_events_quote_occurred_idx ON audit_events(quotation_id, occurred_at DESC);
CREATE INDEX outbox_events_dispatch_idx ON outbox_events(status, available_at);
