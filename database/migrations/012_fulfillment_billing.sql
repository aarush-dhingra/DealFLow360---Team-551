-- Invoice one-time goods only after Finance has selected the warehouse split.
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS fulfillment_order_id UUID REFERENCES fulfillment_orders(id),
  ADD COLUMN IF NOT EXISTS shipping_amount NUMERIC(19,4) NOT NULL DEFAULT 0 CHECK (shipping_amount >= 0);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_fulfillment_order_idx
  ON invoices (fulfillment_order_id)
  WHERE fulfillment_order_id IS NOT NULL;
