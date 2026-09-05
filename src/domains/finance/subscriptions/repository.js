/**
 * Subscription data access (parameterized SQL only).
 */

const SELECT_SUBSCRIPTION = `
  SELECT s.id,
         s.customer_id         AS "customerId",
         s.quotation_line_id   AS "quotationLineId",
         s.plan_id             AS "planId",
         s.status,
         s.started_at          AS "startedAt",
         s.ends_at             AS "endsAt",
         p.interval_unit       AS "intervalUnit",
         p.proration_policy    AS "prorationPolicy",
         p.cancellation_policy AS "cancellationPolicy"
  FROM subscriptions s
  JOIN subscription_plans p ON p.id = s.plan_id
  WHERE s.id = $1
`;

const SELECT_LINE_QUANTITY = `
  SELECT quantity, unit_price AS "unitPrice"
  FROM quotation_lines
  WHERE id = $1
`;

const SELECT_SCHEDULES = `
  SELECT id,
         subscription_id    AS "subscriptionId",
         due_at             AS "dueAt",
         amount,
         status,
         credit_note_id     AS "creditNoteId"
  FROM billing_schedules
  WHERE subscription_id = $1
  ORDER BY due_at ASC
`;

const SELECT_PAID_SCHEDULE_AMOUNT = `
  SELECT amount
  FROM billing_schedules
  WHERE subscription_id = $1
    AND status IN ('pending', 'invoiced', 'paid')
    AND due_at <= now()
  ORDER BY due_at DESC
  LIMIT 1
`;

const INSERT_CREDIT_NOTE = `
  INSERT INTO credit_notes (invoice_id, amount, reason, created_by_user_id, status, applied_amount)
  VALUES (NULL, $1, $2, $3, 'issued', 0)
  RETURNING id
`;

const UPDATE_SUBSCRIPTION_CANCELLED = `
  UPDATE subscriptions
  SET status = 'cancelled',
      ends_at = $2
  WHERE id = $1
  RETURNING id
`;

const INSERT_SCHEDULE = `
  INSERT INTO billing_schedules (subscription_id, due_at, amount, status, credit_note_id)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

export async function findSubscription(client, subscriptionId) {
  const { rows } = await client.query(SELECT_SUBSCRIPTION, [subscriptionId]);
  return rows[0] ?? null;
}

export async function findLineQuantity(client, quotationLineId) {
  const { rows } = await client.query(SELECT_LINE_QUANTITY, [quotationLineId]);
  return rows[0] ?? null;
}

export async function findSchedules(client, subscriptionId) {
  const { rows } = await client.query(SELECT_SCHEDULES, [subscriptionId]);
  return rows;
}

export async function findCurrentPrepaidAmount(client, subscriptionId) {
  const { rows } = await client.query(SELECT_PAID_SCHEDULE_AMOUNT, [subscriptionId]);
  return rows[0]?.amount ?? '0';
}

export async function insertCreditNote(client, { amount, reason, createdByUserId }) {
  const { rows } = await client.query(INSERT_CREDIT_NOTE, [amount, reason, createdByUserId]);
  return rows[0];
}

export async function markSubscriptionCancelled(client, { subscriptionId, endsAt }) {
  const { rows } = await client.query(UPDATE_SUBSCRIPTION_CANCELLED, [subscriptionId, endsAt]);
  return rows[0] ?? null;
}

export async function insertSchedule(
  client,
  { subscriptionId, dueAt, amount, status, creditNoteId }
) {
  const { rows } = await client.query(INSERT_SCHEDULE, [
    subscriptionId,
    dueAt,
    amount,
    status,
    creditNoteId ?? null
  ]);
  return rows[0];
}
