import { pool } from '../../infrastructure/database/pool.js';

export async function listApprovals({ requiredRole, status, limit = 50, offset = 0 }) {
  const conditions = [];
  const params = [];

  if (requiredRole) {
    params.push(requiredRole);
    conditions.push(`ai.required_role = $${params.length}`);
  }
  if (status) {
    params.push(status);
    conditions.push(`ai.status = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT
       ai.id, ai.sequence_number, ai.required_role, ai.status,
       ai.created_at, ai.decided_at,
       q.id AS quotation_id, q.quote_number, q.status AS quote_status,
       c.legal_name AS customer_name,
       u_owner.display_name AS rep_name,
       u_assigned.display_name AS assigned_to,
       ra.blended_risk_percent, ra.route
     FROM approval_instances ai
     JOIN quotations q ON q.id = ai.quotation_id
     JOIN customers c ON c.id = q.customer_id
     JOIN users u_owner ON u_owner.id = q.owner_user_id
     LEFT JOIN users u_assigned ON u_assigned.id = ai.assigned_user_id
     LEFT JOIN risk_assessments ra ON ra.id = ai.risk_assessment_id
     ${where}
     ORDER BY ai.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function getApprovalById(id) {
  const { rows } = await pool.query(
    `SELECT
       ai.id, ai.sequence_number, ai.required_role, ai.status,
       ai.decision_reason, ai.decided_at, ai.created_at,
       ai.quotation_id, ai.quotation_version_id, ai.risk_assessment_id,
       u_assigned.display_name AS assigned_to,
       u_decided.display_name AS decided_by
     FROM approval_instances ai
     LEFT JOIN users u_assigned ON u_assigned.id = ai.assigned_user_id
     LEFT JOIN users u_decided ON u_decided.id = ai.decision_by_user_id
     WHERE ai.id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function getApprovalWithFullDetail(id) {
  const approval = await getApprovalById(id);
  if (!approval) return null;

  // Load quotation summary
  const { rows: quoteRows } = await pool.query(
    `SELECT
       q.id, q.quote_number, q.status, q.current_version_number, q.lock_version,
       c.legal_name AS customer_name, ct.code AS customer_tier,
       u.display_name AS rep_name
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     JOIN customer_tiers ct ON ct.id = c.tier_id
     JOIN users u ON u.id = q.owner_user_id
     WHERE q.id = $1`,
    [approval.quotation_id]
  );
  approval.quotation = quoteRows[0] ?? null;

  // Load version totals
  const { rows: versionRows } = await pool.query(
    `SELECT version_number, pre_discount_total, discount_total, net_total, grand_total,
            currency_code, discount_mode, order_discount_percent
     FROM quotation_versions WHERE id = $1`,
    [approval.quotation_version_id]
  );
  approval.version = versionRows[0] ?? null;

  // Load risk with flagged lines
  if (approval.risk_assessment_id) {
    const { rows: riskRows } = await pool.query(
      `SELECT ra.blended_risk_percent, ra.route, ra.total_pre_discount_order_value,
              ra.total_line_excess_value
       FROM risk_assessments ra WHERE ra.id = $1`,
      [approval.risk_assessment_id]
    );
    approval.risk = riskRows[0] ?? null;

    if (approval.risk) {
      const { rows: lineRows } = await pool.query(
        `SELECT
           ral.requested_discount_percent, ral.allowed_discount_percent,
           ral.line_overage_percent, ral.line_base_value, ral.line_excess_value,
           ql.line_number, ql.description,
           p.name AS product_name, pc.code AS category_code
         FROM risk_assessment_lines ral
         JOIN quotation_lines ql ON ql.id = ral.quotation_line_id
         JOIN products p ON p.id = ql.product_id
         JOIN product_categories pc ON pc.id = ql.category_id
         WHERE ral.risk_assessment_id = $1
         ORDER BY ql.line_number`,
        [approval.risk_assessment_id]
      );
      approval.risk.flagged_lines = lineRows.filter(
        l => parseFloat(l.line_overage_percent) > 0
      );
      approval.risk.all_lines = lineRows;
    }
  }

  // Load approval action timeline
  const { rows: actionRows } = await pool.query(
    `SELECT
       aa.action, aa.reason, aa.created_at,
       u.display_name AS actor_name, u.id AS actor_id
     FROM approval_actions aa
     JOIN users u ON u.id = aa.actor_user_id
     WHERE aa.approval_instance_id = $1
     ORDER BY aa.created_at ASC`,
    [id]
  );
  approval.timeline = actionRows;

  return approval;
}

export async function getNextSequenceNumber(quotationVersionId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(MAX(sequence_number), 0) + 1 AS next
     FROM approval_instances WHERE quotation_version_id = $1`,
    [quotationVersionId]
  );
  return rows[0].next;
}

export async function recordApprovalAction(client, approvalInstanceId, actorUserId, action, reason) {
  await client.query(
    `INSERT INTO approval_actions (approval_instance_id, actor_user_id, action, reason)
     VALUES ($1, $2, $3, $4)`,
    [approvalInstanceId, actorUserId, action, reason]
  );
}

export async function updateApprovalStatus(client, approvalInstanceId, status, actorUserId, reason) {
  await client.query(
    `UPDATE approval_instances
     SET status = $1, decision_by_user_id = $2, decision_reason = $3, decided_at = now()
     WHERE id = $4`,
    [status, actorUserId, reason, approvalInstanceId]
  );
}

export async function updateQuotationStatus(client, quotationId, status, lockVersion) {
  const { rowCount } = await client.query(
    `UPDATE quotations
     SET status = $1, lock_version = lock_version + 1, last_activity_at = now(), updated_at = now()
     WHERE id = $2 AND lock_version = $3`,
    [status, quotationId, lockVersion]
  );
  return rowCount;
}

export async function createFinanceApprovalInstance(client, quotationId, quotationVersionId, riskAssessmentId) {
  const seq = await getNextSequenceNumber(quotationVersionId);
  const { rows } = await client.query(
    `INSERT INTO approval_instances
       (quotation_id, quotation_version_id, risk_assessment_id, sequence_number, required_role, status)
     VALUES ($1, $2, $3, $4, 'finance_operations', 'pending')
     RETURNING id`,
    [quotationId, quotationVersionId, riskAssessmentId, seq]
  );
  return rows[0];
}

export async function insertAuditEvent(client, payload) {
  await client.query(
    `INSERT INTO audit_events
       (aggregate_type, aggregate_id, quotation_id, quotation_version_id,
        event_type, actor_user_id, before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      payload.aggregateType,
      payload.aggregateId,
      payload.quotationId,
      payload.quotationVersionId,
      payload.eventType,
      payload.actorUserId,
      payload.beforeState ? JSON.stringify(payload.beforeState) : null,
      payload.afterState ? JSON.stringify(payload.afterState) : null,
      JSON.stringify(payload.metadata ?? {}),
    ]
  );
}

export async function insertOutboxEvent(client, aggregateType, aggregateId, eventType, payload) {
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [aggregateType, aggregateId, eventType, JSON.stringify(payload)]
  );
}
