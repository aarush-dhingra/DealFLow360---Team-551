/**
 * Deal-health data access (parameterized SQL only).
 */

const SELECT_ASSESSMENT = `
  SELECT d.id,
         d.quotation_id              AS "quotationId",
         d.negotiation_turns         AS "negotiationTurns",
         d.quote_age_days            AS "quoteAgeDays",
         d.inactivity_days           AS "inactivityDays",
         d.score,
         d.band,
         d.policy_snapshot           AS "policySnapshot",
         d.assessed_at               AS "assessedAt",
         d.acknowledged_at           AS "acknowledgedAt",
         d.escalated_at              AS "escalatedAt",
         d.resolved_at               AS "resolvedAt"
  FROM deal_health_assessments d
  WHERE d.id = $1
`;

// Open (unresolved) finance-band assessments, highest score first.
const SELECT_FINANCE_QUEUE = `
  SELECT d.id,
         d.quotation_id              AS "quotationId",
         q.quote_number              AS "quoteNumber",
         q.status                    AS "quoteStatus",
         d.score,
         d.band,
         d.negotiation_turns         AS "negotiationTurns",
         d.quote_age_days            AS "quoteAgeDays",
         d.inactivity_days           AS "inactivityDays",
         d.assessed_at               AS "assessedAt",
         d.acknowledged_at           AS "acknowledgedAt",
         d.escalated_at              AS "escalatedAt",
         d.resolved_at               AS "resolvedAt"
  FROM deal_health_assessments d
  JOIN quotations q ON q.id = d.quotation_id
  WHERE d.band = 'finance'
    AND d.resolved_at IS NULL
  ORDER BY d.score DESC, d.assessed_at DESC
`;

const UPDATE_ACKNOWLEDGE = `
  UPDATE deal_health_assessments
  SET acknowledged_by_user_id = $2,
      acknowledged_at = $3
  WHERE id = $1
    AND acknowledged_at IS NULL
    AND escalated_at IS NULL
    AND resolved_at IS NULL
  RETURNING id
`;

const UPDATE_ESCALATE = `
  UPDATE deal_health_assessments
  SET escalated_by_user_id = $2,
      escalated_at = $3
  WHERE id = $1
    AND escalated_at IS NULL
    AND resolved_at IS NULL
  RETURNING id
`;

const UPDATE_RESOLVE = `
  UPDATE deal_health_assessments
  SET resolved_by_user_id = $2,
      resolved_at = $3
  WHERE id = $1
    AND resolved_at IS NULL
  RETURNING id
`;

export async function findAssessment(client, assessmentId) {
  const { rows } = await client.query(SELECT_ASSESSMENT, [assessmentId]);
  return rows[0] ?? null;
}

export async function findFinanceQueue(client, limit = 100) {
  const { rows } = await client.query(`${SELECT_FINANCE_QUEUE} LIMIT $1`, [limit]);
  return rows;
}

/** Guarded state write; returns true when the row was updated. */
export async function applyAction(client, { assessmentId, action, actorUserId, at }) {
  const sql =
    action === 'acknowledge'
      ? UPDATE_ACKNOWLEDGE
      : action === 'escalate'
        ? UPDATE_ESCALATE
        : UPDATE_RESOLVE;
  const { rowCount } = await client.query(sql, [assessmentId, actorUserId, at]);
  return rowCount === 1;
}
