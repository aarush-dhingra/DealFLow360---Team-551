-- DealFlow360 migration 004 — deal-health Finance action columns (F7).
-- Forward-only, never edit once applied.
--
-- Finance may acknowledge/escalate/resolve a finance-band deal-health
-- assessment. Each action must record WHO and WHEN, so the assessment gains
-- nullable actor/timestamp columns. A health action never mutates price/risk/
-- approval history; it only records handling state (MASTER_CONTEXT section 9).

ALTER TABLE deal_health_assessments
  ADD COLUMN IF NOT EXISTS acknowledged_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalated_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS escalated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by_user_id UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
