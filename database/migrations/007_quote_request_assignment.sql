ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS assigned_sales_rep_id UUID REFERENCES users(id);
ALTER TABLE quote_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS quote_requests_rep_status_idx ON quote_requests(assigned_sales_rep_id,status,created_at DESC);
