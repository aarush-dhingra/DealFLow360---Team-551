import 'dotenv/config';
import { pool } from './pool.js';
import { hashPassword } from '../../modules/identity/password.js';

const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@dealflow360.local').toLowerCase();
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
const demoPassword = process.env.SEED_DEMO_PASSWORD ?? adminPassword;
const client = await pool.connect();

async function ensureUser({ email, displayName, role, passwordHash }) {
  const { rows } = await client.query(
    `INSERT INTO users (email, password_hash, display_name)
     VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE
       SET password_hash = EXCLUDED.password_hash,
           display_name = EXCLUDED.display_name,
           is_active = TRUE,
           must_change_password = FALSE
     RETURNING id`,
    [email, passwordHash, displayName]
  );
  await client.query(
    `INSERT INTO user_roles (user_id, role) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [rows[0].id, role]
  );
  return rows[0].id;
}

async function idFor(table, column, value) {
  const { rows } = await client.query(`SELECT id FROM ${table} WHERE ${column} = $1`, [value]);
  if (!rows[0]) throw new Error(`Seed prerequisite missing: ${table}.${column}=${value}`);
  return rows[0].id;
}

try {
  await client.query('BEGIN');
  const adminHash = await hashPassword(adminPassword);
  const demoHash = await hashPassword(demoPassword);

  await ensureUser({ email: adminEmail, displayName: 'DealFlow360 Admin', role: 'admin', passwordHash: adminHash });
  await ensureUser({ email: 'rep@dealflow360.local', displayName: 'Riya Sales Rep', role: 'sales_rep', passwordHash: demoHash });
  await ensureUser({ email: 'manager@dealflow360.local', displayName: 'Maya Sales Manager', role: 'sales_manager', passwordHash: demoHash });
  await ensureUser({ email: 'finance@dealflow360.local', displayName: 'Farhan Finance', role: 'finance_operations', passwordHash: demoHash });

  for (const [code, name, discount] of [['gold', 'Gold', 15], ['silver', 'Silver', 10], ['bronze', 'Bronze', 5]]) {
    await client.query(
      `INSERT INTO customer_tiers (code, display_name, entitlement_discount_percent, qualification_spend, qualification_order_count)
       VALUES ($1, $2, $3, $4, $5) ON CONFLICT (code) DO UPDATE SET entitlement_discount_percent=EXCLUDED.entitlement_discount_percent, qualification_spend=EXCLUDED.qualification_spend, qualification_order_count=EXCLUDED.qualification_order_count`,
      [code, name, discount, code === 'bronze' ? 10000 : code === 'silver' ? 50000 : 150000, code === 'bronze' ? 3 : code === 'silver' ? 10 : 25]
    );
  }
  for (const [code, name, discount] of [['hardware', 'Hardware', 15], ['software', 'Software', 10]]) {
    await client.query(
      `INSERT INTO product_categories (code, display_name, discount_ceiling_percent)
       VALUES ($1, $2, $3) ON CONFLICT (code) DO NOTHING`,
      [code, name, discount]
    );
  }
  await client.query(`INSERT INTO approval_policies (manager_max_blended_risk_percent, high_risk_route)
    SELECT 5, 'manager_then_finance' WHERE NOT EXISTS (SELECT 1 FROM approval_policies WHERE is_active)`);
  await client.query(`INSERT INTO deal_health_policies (turn_points, turn_points_cap, quote_age_day_points, quote_age_points_cap, inactivity_day_points, inactivity_points_cap, warning_threshold, manager_threshold, finance_threshold)
    SELECT 10, 50, 2, 30, 5, 20, 50, 75, 90 WHERE NOT EXISTS (SELECT 1 FROM deal_health_policies WHERE is_active)`);

  const goldTierId = await idFor('customer_tiers', 'code', 'gold');
  const silverTierId = await idFor('customer_tiers', 'code', 'silver');
  for (const [legalName, tierId] of [['Acme Corp', goldTierId], ['Beta Industries', silverTierId]]) {
    await client.query(
      `INSERT INTO customers (legal_name, tier_id, currency_code)
       SELECT $1, $2, 'USD' WHERE NOT EXISTS (SELECT 1 FROM customers WHERE legal_name = $1)`,
      [legalName, tierId]
    );
  }
  await client.query(`INSERT INTO customers (legal_name, tier_id, currency_code)
    SELECT 'Gamma Startups', NULL, 'USD' WHERE NOT EXISTS (SELECT 1 FROM customers WHERE legal_name = 'Gamma Startups')`);
  const acmeId = await idFor('customers', 'legal_name', 'Acme Corp');
  await client.query(
    `INSERT INTO customer_contacts (customer_id, email, display_name)
     VALUES ($1, 'purchasing@acme.example', 'Alex Buyer') ON CONFLICT (customer_id, email) DO NOTHING`,
    [acmeId]
  );
  const gammaId = await idFor('customers', 'legal_name', 'Gamma Startups');
  await client.query(`INSERT INTO customer_contacts (customer_id, email, display_name)
    VALUES ($1, 'buyer@gamma.example', 'Gina Buyer') ON CONFLICT (customer_id, email) DO NOTHING`, [gammaId]);

  const hardwareId = await idFor('product_categories', 'code', 'hardware');
  const softwareId = await idFor('product_categories', 'code', 'software');
  const products = [
    ['LAPTOP-PRO', 'Pro Laptop', hardwareId, 'Business laptop for the demo deal.', 'one_time', '1200.0000', '800.0000'],
    ['DOCK-USBC', 'USB-C Dock', hardwareId, 'Suggested cross-sell accessory.', 'one_time', '180.0000', '90.0000'],
    ['SETUP-SVC', 'Implementation Service', softwareId, 'Lower-ceiling service line for approval routing.', 'one_time', '300.0000', '160.0000'],
    ['SUPPORT-MONTHLY', 'Managed Support', softwareId, 'Recurring support service.', 'recurring', '75.0000', '25.0000'],
  ];
  for (const [sku, name, categoryId, description, billingKind, listPrice, standardCost] of products) {
    await client.query(
      `INSERT INTO products (sku, name, category_id, description, unit_name, list_price, standard_cost, tax_percent, billing_kind)
       VALUES ($1, $2, $3, $4, 'unit', $5, $6, 0, $7)
       ON CONFLICT (sku) DO UPDATE
         SET name = EXCLUDED.name, category_id = EXCLUDED.category_id, description = EXCLUDED.description,
             list_price = EXCLUDED.list_price, standard_cost = EXCLUDED.standard_cost,
             billing_kind = EXCLUDED.billing_kind, is_active = TRUE`,
      [sku, name, categoryId, description, listPrice, standardCost, billingKind]
    );
  }
  await client.query(
    `INSERT INTO subscription_plans (code, name, interval_unit, proration_policy, cancellation_policy)
     VALUES ('MONTHLY-SUPPORT', 'Monthly Managed Support', 'month', '{"method":"daily"}', '{"refund":"prorated"}')
     ON CONFLICT (code) DO NOTHING`
  );

  for (const [code, name, weight] of [['MAIN', 'Main Warehouse', '1.0000'], ['EAST', 'East Depot', '1.2000']]) {
    await client.query(
      `INSERT INTO warehouses (code, name, shipping_cost_weight) VALUES ($1, $2, $3)
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, shipping_cost_weight = EXCLUDED.shipping_cost_weight, is_active = TRUE`,
      [code, name, weight]
    );
  }
  const mainWarehouseId = await idFor('warehouses', 'code', 'MAIN');
  const eastWarehouseId = await idFor('warehouses', 'code', 'EAST');
  const laptopId = await idFor('products', 'sku', 'LAPTOP-PRO');
  const dockId = await idFor('products', 'sku', 'DOCK-USBC');
  const setupId = await idFor('products', 'sku', 'SETUP-SVC');
  const supportId = await idFor('products', 'sku', 'SUPPORT-MONTHLY');
  for (const [warehouseId, productId, quantity] of [[mainWarehouseId, laptopId, 3], [eastWarehouseId, laptopId, 4], [mainWarehouseId, dockId, 12], [eastWarehouseId, dockId, 5], [mainWarehouseId, setupId, 100], [mainWarehouseId, supportId, 100]]) {
    await client.query(
      `INSERT INTO inventory_levels (warehouse_id, product_id, quantity_on_hand, quantity_reserved, reorder_point)
       VALUES ($1, $2, $3, 0, 2) ON CONFLICT (warehouse_id, product_id) DO NOTHING`,
      [warehouseId, productId, quantity]
    );
  }

  await client.query(
    `INSERT INTO price_lists (name, tier_id, currency_code)
     SELECT 'Gold USD', $1, 'USD'
     WHERE NOT EXISTS (SELECT 1 FROM price_lists WHERE name = 'Gold USD' AND tier_id = $1 AND currency_code = 'USD')`,
    [goldTierId]
  );
  const { rows: priceLists } = await client.query(
    `SELECT id FROM price_lists WHERE name = 'Gold USD' AND tier_id = $1 AND currency_code = 'USD' ORDER BY created_at LIMIT 1`,
    [goldTierId]
  );
  for (const [productId, unitPrice] of [[laptopId, '1150.0000'], [dockId, '160.0000'], [setupId, '300.0000'], [supportId, '70.0000']]) {
    await client.query(
      `INSERT INTO price_list_items (price_list_id, product_id, unit_price)
       SELECT $1, $2, $3
       WHERE NOT EXISTS (SELECT 1 FROM price_list_items WHERE price_list_id = $1 AND product_id = $2 AND valid_from IS NULL AND valid_to IS NULL)`,
      [priceLists[0].id, productId, unitPrice]
    );
  }
  await client.query(
    `INSERT INTO upsell_rules (trigger_product_id, suggested_product_id, rule_kind, rank_weight, promotion_tag, minimum_margin_percent)
     SELECT $1, $2, 'cross_sell', 100, 'Bundle offer', 20
     WHERE NOT EXISTS (SELECT 1 FROM upsell_rules WHERE trigger_product_id = $1 AND suggested_product_id = $2)`,
    [laptopId, dockId]
  );

  await client.query('COMMIT');
  console.log('Seeded DealFlow360 demo data: rep@dealflow360.local, manager@dealflow360.local, finance@dealflow360.local.');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
  await pool.end();
}
