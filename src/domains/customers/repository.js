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
