-- Preserve the customer request that started a quotation.  A request is never
-- removed when it is converted: it remains the customer-facing origin record.
ALTER TABLE quote_requests
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES quotations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS quote_requests_quotation_idx ON quote_requests(quotation_id);
