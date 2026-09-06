-- Older quotes could be marked under_negotiation before negotiation_cases
-- existed. Backfill a real owner so they remain actionable and visible.
WITH inserted AS (
  INSERT INTO negotiation_cases (quotation_id, owner_role, status, last_handoff_reason, opened_at, updated_at)
  SELECT q.id,
         CASE
           WHEN EXISTS (SELECT 1 FROM approval_instances ai WHERE ai.quotation_id = q.id AND ai.status = 'pending' AND ai.required_role = 'finance_operations') THEN 'finance_operations'::user_role
           WHEN EXISTS (SELECT 1 FROM approval_instances ai WHERE ai.quotation_id = q.id AND ai.status = 'pending' AND ai.required_role = 'sales_manager') THEN 'sales_manager'::user_role
           ELSE 'sales_rep'::user_role
         END,
         'open',
         'Backfilled active negotiation case.',
         now(), now()
  FROM quotations q
  LEFT JOIN negotiation_cases nc ON nc.quotation_id = q.id
  WHERE q.status = 'under_negotiation' AND nc.id IS NULL
  RETURNING id, quotation_id
)
INSERT INTO negotiation_case_events (negotiation_case_id, event_type, to_role, reason, quotation_version_number)
SELECT inserted.id, 'negotiation_case_backfilled', nc.owner_role, 'Restored from legacy under-negotiation status.', q.current_version_number
FROM inserted
JOIN negotiation_cases nc ON nc.id = inserted.id
JOIN quotations q ON q.id = inserted.quotation_id;
