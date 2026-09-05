import 'dotenv/config';
import { pool } from './pool.js';
import { hashPassword } from '../../modules/identity/password.js';

const email = (process.env.SEED_ADMIN_EMAIL ?? 'admin@dealflow360.local').toLowerCase();
const password = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
const client = await pool.connect();
try {
  await client.query('BEGIN');
  const hash = await hashPassword(password);
  const { rows: admins } = await client.query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, 'DealFlow360 Admin')
     ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, is_active = TRUE RETURNING id`, [email, hash]
  );
  await client.query(`INSERT INTO user_roles (user_id, role) VALUES ($1, 'admin') ON CONFLICT DO NOTHING`, [admins[0].id]);
  for (const [code, name, discount] of [['gold', 'Gold', 15], ['silver', 'Silver', 10], ['bronze', 'Bronze', 5]]) {
    await client.query(
      `INSERT INTO customer_tiers (code, display_name, entitlement_discount_percent) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`, [code, name, discount]
    );
  }
  for (const [code, name, discount] of [['hardware', 'Hardware', 15], ['software', 'Software', 10]]) {
    await client.query(
      `INSERT INTO product_categories (code, display_name, discount_ceiling_percent) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO NOTHING`, [code, name, discount]
    );
  }
  await client.query(`INSERT INTO approval_policies (manager_max_blended_risk_percent, high_risk_route)
    SELECT 5, 'manager_then_finance' WHERE NOT EXISTS (SELECT 1 FROM approval_policies WHERE is_active)`);
  await client.query(`INSERT INTO deal_health_policies (turn_points, turn_points_cap, quote_age_day_points, quote_age_points_cap, inactivity_day_points, inactivity_points_cap, warning_threshold, manager_threshold, finance_threshold)
    SELECT 10, 50, 2, 30, 5, 20, 50, 75, 90 WHERE NOT EXISTS (SELECT 1 FROM deal_health_policies WHERE is_active)`);
  await client.query('COMMIT');
  console.log(`Seeded admin ${email}`);
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
