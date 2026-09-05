import Decimal from 'decimal.js';
import { pool } from '../../infrastructure/database/pool.js';

// ─── Deal health policy ───────────────────────────────────────────────────────

export async function getActiveDealHealthPolicy() {
  const { rows } = await pool.query(
    `SELECT id, turn_points, turn_points_cap, quote_age_day_points, quote_age_points_cap,
            inactivity_day_points, inactivity_points_cap, warning_threshold,
            manager_threshold, finance_threshold, policy_version
     FROM deal_health_policies WHERE is_active = true ORDER BY policy_version DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

// ─── Deal health assessments ──────────────────────────────────────────────────

export async function assessAndStore(quotationId, policy) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(
      `SELECT
         q.id,
         q.opened_at,
         q.last_activity_at,
         EXTRACT(DAY FROM now() - q.opened_at)::int AS quote_age_days,
         EXTRACT(DAY FROM now() - q.last_activity_at)::int AS inactivity_days,
         COUNT(nm.id) AS negotiation_turns
       FROM quotations q
       LEFT JOIN negotiation_messages nm ON nm.quotation_id = q.id
       WHERE q.id = $1
       GROUP BY q.id`,
      [quotationId]
    );

    if (!rows.length) return null;

    const { quote_age_days, inactivity_days, negotiation_turns } = rows[0];
    const turns = parseInt(negotiation_turns, 10);
    const ageDays = parseInt(quote_age_days, 10);
    const inactDays = parseInt(inactivity_days, 10);

    const capped = (value, cap) => Decimal.min(new Decimal(value), new Decimal(cap));
    const score = capped(new Decimal(turns).mul(policy.turn_points), policy.turn_points_cap)
      .plus(capped(new Decimal(ageDays).mul(policy.quote_age_day_points), policy.quote_age_points_cap))
      .plus(capped(new Decimal(inactDays).mul(policy.inactivity_day_points), policy.inactivity_points_cap));

    const { rows: assessmentRows } = await client.query(
      `INSERT INTO deal_health_assessments
         (quotation_id, negotiation_turns, quote_age_days, inactivity_days, score, band, policy_snapshot)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, score, band, assessed_at`,
      [
        quotationId,
        turns,
        ageDays,
        inactDays,
        score.toFixed(4),
        'normal',
        JSON.stringify(policy),
      ]
    );

    await client.query('COMMIT');
    return { assessment: assessmentRows[0], turns, ageDays, inactDays, score: score.toFixed(4) };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getStalledDeals(inactivityThresholdDays = 7) {
  const { rows } = await pool.query(
    `SELECT
       q.id AS quotation_id, q.quote_number, q.status, q.last_activity_at,
       EXTRACT(DAY FROM now() - q.last_activity_at)::int AS inactivity_days,
       c.legal_name AS customer_name,
       u.display_name AS rep_name, u.id AS rep_id,
       dha.score AS health_score, dha.band
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     JOIN users u ON u.id = q.owner_user_id
     LEFT JOIN LATERAL (
       SELECT score, band FROM deal_health_assessments
       WHERE quotation_id = q.id ORDER BY assessed_at DESC LIMIT 1
     ) dha ON true
     WHERE q.status NOT IN ('paid', 'rejected', 'cancelled', 'expired', 'superseded', 'fulfilled')
       AND EXTRACT(DAY FROM now() - q.last_activity_at) >= $1
     ORDER BY q.last_activity_at ASC`,
    [inactivityThresholdDays]
  );
  return rows;
}

export async function getDiscountAnomalies() {
  const { rows } = await pool.query(
    `WITH rep_avg AS (
       SELECT
         q.owner_user_id,
         AVG(
           CASE qv.discount_mode
             WHEN 'order' THEN qv.order_discount_percent
             ELSE (qv.discount_total / NULLIF(qv.pre_discount_total, 0)) * 100
           END
         ) AS avg_discount_percent
       FROM quotations q
       JOIN quotation_versions qv
         ON qv.quotation_id = q.id AND qv.version_number = q.current_version_number
       WHERE q.status NOT IN ('draft')
       GROUP BY q.owner_user_id
     )
     SELECT
       q.id AS quotation_id, q.quote_number, q.status,
       c.legal_name AS customer_name,
       u.display_name AS rep_name, u.id AS rep_id,
       rep_avg.avg_discount_percent AS rep_avg_discount_percent,
       CASE qv.discount_mode
         WHEN 'order' THEN qv.order_discount_percent
         ELSE (qv.discount_total / NULLIF(qv.pre_discount_total, 0)) * 100
       END AS this_quote_discount_percent,
       (
         CASE qv.discount_mode
           WHEN 'order' THEN qv.order_discount_percent
           ELSE (qv.discount_total / NULLIF(qv.pre_discount_total, 0)) * 100
         END
       ) - rep_avg.avg_discount_percent AS delta
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     JOIN users u ON u.id = q.owner_user_id
     JOIN quotation_versions qv
       ON qv.quotation_id = q.id AND qv.version_number = q.current_version_number
     JOIN rep_avg ON rep_avg.owner_user_id = q.owner_user_id
     WHERE q.status NOT IN ('paid', 'rejected', 'cancelled', 'expired', 'superseded')
       AND (
         CASE qv.discount_mode
           WHEN 'order' THEN qv.order_discount_percent
           ELSE (qv.discount_total / NULLIF(qv.pre_discount_total, 0)) * 100
         END
       ) > rep_avg.avg_discount_percent * 1.5
     ORDER BY delta DESC
     LIMIT 20`,
    []
  );
  return rows;
}

export async function getPendingApprovalsSummary() {
  const { rows } = await pool.query(
    `SELECT required_role, COUNT(*) AS count
     FROM approval_instances
     WHERE status = 'pending'
     GROUP BY required_role`
  );
  return rows;
}

export async function nudgeRep(quotationId, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `INSERT INTO audit_events
         (aggregate_type, aggregate_id, quotation_id, event_type, actor_user_id, metadata)
       VALUES ('quotation', $1, $1, 'rep_nudged', $2, '{}')`,
      [quotationId, actorUserId]
    );

    await client.query(
      `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
       VALUES ('quotation', $1, 'rep_nudge_requested', $2)`,
      [quotationId, JSON.stringify({ quotation_id: quotationId, nudged_by: actorUserId })]
    );

    await client.query(
      `UPDATE quotations SET last_activity_at = now() WHERE id = $1`,
      [quotationId]
    );

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
