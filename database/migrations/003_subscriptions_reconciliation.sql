-- DealFlow360 migration 003 — subscription + reconciliation schema support.
-- Forward-only, never edit once applied.
--
-- Subscription cancellations and prorated refunds create credit notes that are
-- not yet tied to an invoice, so credit_notes.invoice_id becomes nullable.
-- billing_schedules gains an optional credit-note link so a prorated refund is
-- traceable back to the schedule that produced it (reconciliation).

ALTER TABLE credit_notes
  ALTER COLUMN invoice_id DROP NOT NULL;

ALTER TABLE billing_schedules
  ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES credit_notes(id);
