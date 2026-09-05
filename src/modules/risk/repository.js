import { pool } from '../../infrastructure/database/pool.js';

/**
 * Runs the blended risk calculation entirely in PostgreSQL using NUMERIC arithmetic,
 * stores the result atomically, and returns the assessment with per-line breakdown.
 */
export async function computeAndStoreRisk(quotationVersionId, route, policy) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Compute per-line overage and excess value in the DB using NUMERIC
    const { rows: lineData } = await client.query(
      `SELECT
         ql.id AS quotation_line_id,
         ql.line_base_value,
         COALESCE(ql.line_discount_percent, 0) AS requested_discount_percent,
         ql.allowed_discount_percent,
         GREATEST(0, COALESCE(ql.line_discount_percent, 0) - ql.allowed_discount_percent)
           AS line_overage_percent,
         ql.line_base_value
           * GREATEST(0, COALESCE(ql.line_discount_percent, 0) - ql.allowed_discount_percent)
           / 100
           AS line_excess_value
       FROM quotation_lines ql
       WHERE ql.quotation_version_id = $1`,
      [quotationVersionId]
    );

    if (!lineData.length) {
      throw new Error('No lines found for quotation version');
    }

    // Aggregate totals (still using DB for precision via SUM over NUMERIC rows)
    const { rows: totals } = await client.query(
      `SELECT
         SUM(ql.line_base_value) AS total_pre_discount_order_value,
         SUM(
           ql.line_base_value
           * GREATEST(0, COALESCE(ql.line_discount_percent, 0) - ql.allowed_discount_percent)
           / 100
         ) AS total_line_excess_value,
         CASE
           WHEN SUM(ql.line_base_value) > 0
           THEN (
             SUM(
               ql.line_base_value
               * GREATEST(0, COALESCE(ql.line_discount_percent, 0) - ql.allowed_discount_percent)
               / 100
             ) / SUM(ql.line_base_value)
           ) * 100
           ELSE 0
         END AS blended_risk_percent
       FROM quotation_lines ql
       WHERE ql.quotation_version_id = $1`,
      [quotationVersionId]
    );

    const { total_pre_discount_order_value, total_line_excess_value, blended_risk_percent } = totals[0];

    if (parseFloat(total_pre_discount_order_value) <= 0) {
      throw new Error('Pre-discount order value must be positive before risk can be assessed');
    }

    // Store risk assessment
    const { rows: assessmentRows } = await client.query(
      `INSERT INTO risk_assessments
         (quotation_version_id, total_pre_discount_order_value, total_line_excess_value,
          blended_risk_percent, route, inputs_snapshot, policy_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (quotation_version_id) DO UPDATE
         SET total_pre_discount_order_value = EXCLUDED.total_pre_discount_order_value,
             total_line_excess_value        = EXCLUDED.total_line_excess_value,
             blended_risk_percent           = EXCLUDED.blended_risk_percent,
             route                          = EXCLUDED.route,
             inputs_snapshot                = EXCLUDED.inputs_snapshot,
             policy_snapshot                = EXCLUDED.policy_snapshot,
             assessed_at                    = now()
       RETURNING id, blended_risk_percent, route, assessed_at`,
      [
        quotationVersionId,
        total_pre_discount_order_value,
        total_line_excess_value,
        blended_risk_percent,
        route,
        JSON.stringify({ lines: lineData }),
        JSON.stringify(policy),
      ]
    );

    const assessment = assessmentRows[0];

    // Store per-line breakdown
    await client.query(
      `DELETE FROM risk_assessment_lines WHERE risk_assessment_id = $1`,
      [assessment.id]
    );

    for (const line of lineData) {
      await client.query(
        `INSERT INTO risk_assessment_lines
           (risk_assessment_id, quotation_line_id, requested_discount_percent,
            allowed_discount_percent, line_overage_percent, line_base_value, line_excess_value)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          assessment.id,
          line.quotation_line_id,
          line.requested_discount_percent,
          line.allowed_discount_percent,
          line.line_overage_percent,
          line.line_base_value,
          line.line_excess_value,
        ]
      );
    }

    await client.query('COMMIT');
    return { assessment, lines: lineData };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getRiskByVersionId(quotationVersionId) {
  const { rows } = await pool.query(
    `SELECT
       ra.id, ra.blended_risk_percent, ra.route, ra.total_pre_discount_order_value,
       ra.total_line_excess_value, ra.assessed_at
     FROM risk_assessments ra
     WHERE ra.quotation_version_id = $1`,
    [quotationVersionId]
  );
  if (!rows.length) return null;
  const assessment = rows[0];

  const { rows: lineRows } = await pool.query(
    `SELECT
       ral.quotation_line_id, ral.requested_discount_percent, ral.allowed_discount_percent,
       ral.line_overage_percent, ral.line_base_value, ral.line_excess_value,
       ql.description, ql.line_number,
       p.name AS product_name,
       pc.code AS category_code
     FROM risk_assessment_lines ral
     JOIN quotation_lines ql ON ql.id = ral.quotation_line_id
     JOIN products p ON p.id = ql.product_id
     JOIN product_categories pc ON pc.id = ql.category_id
     WHERE ral.risk_assessment_id = $1
     ORDER BY ql.line_number`,
    [assessment.id]
  );

  assessment.lines = lineRows;
  return assessment;
}

export async function getRiskByQuotationId(quotationId) {
  const { rows } = await pool.query(
    `SELECT qv.id AS quotation_version_id, qv.version_number
     FROM quotation_versions qv
     JOIN quotations q ON q.id = qv.quotation_id
     WHERE qv.quotation_id = $1 AND qv.version_number = q.current_version_number`,
    [quotationId]
  );
  if (!rows.length) return null;
  return getRiskByVersionId(rows[0].quotation_version_id);
}
