import { pool } from '../../infrastructure/database/pool.js';

export async function getTiers() {
  const { rows } = await pool.query(
    `SELECT id, code, display_name, entitlement_discount_percent, policy_version, is_active
     FROM customer_tiers ORDER BY code`
  );
  return rows;
}

export async function getTierByCode(code) {
  const { rows } = await pool.query(
    `SELECT id, code, display_name, entitlement_discount_percent, policy_version, is_active
     FROM customer_tiers WHERE code = $1`,
    [code]
  );
  return rows[0] ?? null;
}

export async function updateTierEntitlement(code, percent, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: before } = await client.query(
      'SELECT * FROM customer_tiers WHERE code = $1', [code]
    );
    if (!before.length) return null;
    const prev = before[0];

    const { rows } = await client.query(
      `UPDATE customer_tiers
       SET entitlement_discount_percent = $1, policy_version = policy_version + 1, updated_at = now()
       WHERE code = $2
       RETURNING id, code, display_name, entitlement_discount_percent, policy_version`,
      [percent, code]
    );
    const updated = rows[0];

    await client.query(
      `INSERT INTO audit_events
         (aggregate_type, aggregate_id, event_type, actor_user_id, before_state, after_state)
       VALUES ('customer_tier', $1, 'tier_entitlement_updated', $2, $3, $4)`,
      [updated.id, actorUserId, JSON.stringify(prev), JSON.stringify(updated)]
    );

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getCategories() {
  const { rows } = await pool.query(
    `SELECT id, code, display_name, discount_ceiling_percent, policy_version, is_active
     FROM product_categories ORDER BY code`
  );
  return rows;
}

export async function getCategoryByCode(code) {
  const { rows } = await pool.query(
    `SELECT id, code, display_name, discount_ceiling_percent, policy_version, is_active
     FROM product_categories WHERE code = $1`,
    [code]
  );
  return rows[0] ?? null;
}

export async function updateCategoryCeiling(code, percent, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: before } = await client.query(
      'SELECT * FROM product_categories WHERE code = $1', [code]
    );
    if (!before.length) return null;
    const prev = before[0];

    const { rows } = await client.query(
      `UPDATE product_categories
       SET discount_ceiling_percent = $1, policy_version = policy_version + 1, updated_at = now()
       WHERE code = $2
       RETURNING id, code, display_name, discount_ceiling_percent, policy_version`,
      [percent, code]
    );
    const updated = rows[0];

    await client.query(
      `INSERT INTO audit_events
         (aggregate_type, aggregate_id, event_type, actor_user_id, before_state, after_state)
       VALUES ('product_category', $1, 'category_ceiling_updated', $2, $3, $4)`,
      [updated.id, actorUserId, JSON.stringify(prev), JSON.stringify(updated)]
    );

    await client.query('COMMIT');
    return updated;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveApprovalPolicy() {
  const { rows } = await pool.query(
    `SELECT id, manager_max_blended_risk_percent, high_risk_route, policy_version, is_active, created_at
     FROM approval_policies WHERE is_active = true ORDER BY policy_version DESC LIMIT 1`
  );
  return rows[0] ?? null;
}

export async function upsertApprovalPolicy(managerMax, highRiskRoute, actorUserId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      `UPDATE approval_policies SET is_active = false WHERE is_active = true`
    );

    const { rows } = await client.query(
      `INSERT INTO approval_policies
         (manager_max_blended_risk_percent, high_risk_route, is_active, policy_version)
       SELECT $1, $2, true, COALESCE(MAX(policy_version), 0) + 1 FROM approval_policies
       RETURNING id, manager_max_blended_risk_percent, high_risk_route, policy_version`,
      [managerMax, highRiskRoute]
    );
    const created = rows[0];

    await client.query(
      `INSERT INTO audit_events
         (aggregate_type, aggregate_id, event_type, actor_user_id, after_state)
       VALUES ('approval_policy', $1, 'approval_policy_updated', $2, $3)`,
      [created.id, actorUserId, JSON.stringify(created)]
    );

    await client.query('COMMIT');
    return created;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getActiveDealHealthPolicy() {
  const { rows } = await pool.query(
    `SELECT id, turn_points, turn_points_cap, quote_age_day_points, quote_age_points_cap,
            inactivity_day_points, inactivity_points_cap, warning_threshold,
            manager_threshold, finance_threshold, policy_version
     FROM deal_health_policies WHERE is_active = true ORDER BY policy_version DESC LIMIT 1`
  );
  return rows[0] ?? null;
}
