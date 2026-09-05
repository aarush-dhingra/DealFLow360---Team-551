-- Retain quantities that cannot be allocated from current warehouse stock.
-- A backorder is explicit so an order can be split, partially fulfilled, and later consolidated.

CREATE TABLE fulfillment_backorders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_order_id UUID NOT NULL REFERENCES fulfillment_orders(id),
  quotation_line_id UUID NOT NULL REFERENCES quotation_lines(id),
  preferred_warehouse_id UUID REFERENCES warehouses(id),
  quantity NUMERIC(19,4) NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'allocated', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX fulfillment_backorders_order_status_idx
  ON fulfillment_backorders(fulfillment_order_id, status);
