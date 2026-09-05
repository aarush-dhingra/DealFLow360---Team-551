/**
 * Approval data access.
 *
 * Parameterized SQL only — no business rules. Rows are read and mutated on the
 * transaction client supplied by the service so the decision commits atomically
 * with audit + outbox rows.
 */

const SELECT_INSTANCE = `
  SELECT ai.id,
         ai.quotation_id          AS "quotationId",
         ai.quotation_version_id  AS "quotationVersionId",
         ai.sequence_number       AS "sequenceNumber",
         ai.required_role         AS "requiredRole",
         ai.status,
         ai.assigned_user_id      AS "assignedUserId"
  FROM approval_instances ai
  WHERE ai.id = $1
`;

const SELECT_QUOTE = `
  SELECT q.id,
         q.status,
         q.lock_version           AS "lockVersion",
         q.current_version_number AS "currentVersionNumber"
  FROM quotations q
  WHERE q.id = $1
`;

const SELECT_CURRENT_VERSION_ID = `
  SELECT qv.id AS "currentVersionId"
  FROM quotation_versions qv
  JOIN quotations q ON q.id = qv.quotation_id
  WHERE q.id = $1
    AND qv.version_number = q.current_version_number
`;

const SELECT_PRIOR_STEP = `
  SELECT ai.id,
         ai.status
  FROM approval_instances ai
  WHERE ai.quotation_version_id = $1
    AND ai.sequence_number < $2
  ORDER BY ai.sequence_number DESC
  LIMIT 1
`;

const DECIDE_INSTANCE = `
  UPDATE approval_instances
  SET status = $2,
      decision_by_user_id = $3,
      decision_reason = $4,
      decided_at = now()
  WHERE id = $1
    AND status = 'pending'
  RETURNING id
`;

const UPDATE_QUOTE_STATUS = `
  UPDATE quotations
  SET status = $2,
      lock_version = lock_version + 1,
      updated_at = now()
  WHERE id = $1
    AND lock_version = $3
  RETURNING id
`;

const INSERT_APPROVAL_ACTION = `
  INSERT INTO approval_actions (approval_instance_id, actor_user_id, action, reason)
  VALUES ($1, $2, $3, $4)
  RETURNING id
`;

export async function findInstance(client, approvalInstanceId) {
  const { rows } = await client.query(SELECT_INSTANCE, [approvalInstanceId]);
  return rows[0] ?? null;
}

export async function findQuote(client, quotationId) {
  const { rows } = await client.query(SELECT_QUOTE, [quotationId]);
  return rows[0] ?? null;
}

export async function findCurrentVersionId(client, quotationId) {
  const { rows } = await client.query(SELECT_CURRENT_VERSION_ID, [quotationId]);
  return rows[0]?.currentVersionId ?? null;
}

export async function findPriorStep(client, quotationVersionId, sequenceNumber) {
  const { rows } = await client.query(SELECT_PRIOR_STEP, [quotationVersionId, sequenceNumber]);
  return rows[0] ?? null;
}

/** Guarded decision write: only flips a still-pending instance. */
export async function decideInstance(client, { id, status, decisionByUserId, reason }) {
  const { rows } = await client.query(DECIDE_INSTANCE, [id, status, decisionByUserId, reason]);
  return rows[0] ?? null;
}

/** Optimistic quote transition using quotations.lock_version. */
export async function updateQuoteStatus(client, { quotationId, status, expectedLockVersion }) {
  const { rows } = await client.query(UPDATE_QUOTE_STATUS, [
    quotationId,
    status,
    expectedLockVersion
  ]);
  return rows[0] ?? null;
}

export async function insertApprovalAction(client, { instanceId, actorUserId, action, reason }) {
  const { rows } = await client.query(INSERT_APPROVAL_ACTION, [
    instanceId,
    actorUserId,
    action,
    reason
  ]);
  return rows[0] ?? null;
}
