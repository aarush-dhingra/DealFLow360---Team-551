-- DealFlow360 finance schema support (forward-only, never edit once applied).
--
-- Extends the base schema for the finance slice (approvals, fulfillment,
-- payments, credit notes):
--   * invoices.lock_version            -> optimistic concurrency for payments
--     and credit-note applications.
--   * credit_notes.status/applied_amount -> issued/applied/void lifecycle so
--     credit-note transitions are persisted and reconciled.
--   * partial unique index on fulfillment_orders -> one live fulfillment order
--     per quotation; cancelled orders free the slot for a new one.
--
-- Backorder persistence uses a single model: fulfillment_allocations rows with
-- status = 'backordered'. No separate fulfillment_backorders table is added.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS lock_version INTEGER NOT NULL DEFAULT 1 CHECK (lock_version > 0);

ALTER TABLE credit_notes
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'issued'
    CHECK (status IN ('issued', 'applied', 'void')),
  ADD COLUMN IF NOT EXISTS applied_amount NUMERIC(19,4) NOT NULL DEFAULT 0
    CHECK (applied_amount >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS fulfillment_orders_one_live_per_quote
  ON fulfillment_orders (quotation_id)
  WHERE status <> 'cancelled';
