CREATE TABLE quote_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id),
  contact_id UUID NOT NULL REFERENCES customer_contacts(id),
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'viewed', 'converted')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
