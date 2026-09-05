import { pool } from '../../infrastructure/database/pool.js';

export async function listQuotations({ status, ownerId, customerId, limit = 50, offset = 0 }) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`q.status = $${params.length}`);
  }
  if (ownerId) {
    params.push(ownerId);
    conditions.push(`q.owner_user_id = $${params.length}`);
  }
  if (customerId) {
    params.push(customerId);
    conditions.push(`q.customer_id = $${params.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT
       q.id, q.quote_number, q.status, q.current_version_number,
       q.opened_at, q.last_activity_at,
       c.id AS customer_id, c.legal_name AS customer_name,
       u.id AS owner_id, u.display_name AS owner_name,
       qv.pre_discount_total, qv.net_total, qv.grand_total, qv.currency_code
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     JOIN users u ON u.id = q.owner_user_id
     LEFT JOIN quotation_versions qv
       ON qv.quotation_id = q.id AND qv.version_number = q.current_version_number
     ${where}
     ORDER BY q.last_activity_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function getQuotationById(id) {
  const { rows } = await pool.query(
    `SELECT
       q.id, q.quote_number, q.status, q.current_version_number, q.lock_version,
       q.opened_at, q.last_activity_at, q.closed_at,
       c.id AS customer_id, c.legal_name AS customer_name,
       ct.code AS customer_tier, ct.entitlement_discount_percent AS tier_entitlement_percent,
       u.id AS owner_id, u.display_name AS owner_name
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN customer_tiers ct ON ct.id = c.tier_id
     JOIN users u ON u.id = q.owner_user_id
     WHERE q.id = $1`,
    [id]
  );
  if (!rows.length) return null;

  const quote = rows[0];

  const { rows: versionRows } = await pool.query(
    `SELECT
       qv.id AS version_id, qv.version_number, qv.discount_mode, qv.order_discount_percent,
       qv.currency_code, qv.pre_discount_total, qv.discount_total, qv.net_total,
       qv.tax_total, qv.grand_total, qv.reason, qv.created_at AS version_created_at
     FROM quotation_versions qv
     WHERE qv.quotation_id = $1 AND qv.version_number = $2`,
    [id, quote.current_version_number]
  );
  quote.version = versionRows[0] ?? null;

  if (quote.version) {
    const { rows: lineRows } = await pool.query(
      `SELECT
         ql.id, ql.line_number, ql.description, ql.quantity, ql.unit_price,
         ql.line_base_value, ql.line_discount_percent, ql.allowed_discount_percent,
         ql.net_line_value, ql.tax_percent,
         p.id AS product_id, p.name AS product_name, p.sku,
         pc.code AS category_code, pc.display_name AS category_name
       FROM quotation_lines ql
       JOIN products p ON p.id = ql.product_id
       JOIN product_categories pc ON pc.id = ql.category_id
       WHERE ql.quotation_version_id = $1
       ORDER BY ql.line_number`,
      [quote.version.version_id]
    );
    quote.version.lines = lineRows;
  }

  return quote;
}

export async function getQuotationVersion(quotationId, versionNumber) {
  const { rows } = await pool.query(
    `SELECT
       qv.id AS version_id, qv.version_number, qv.discount_mode, qv.order_discount_percent,
       qv.currency_code, qv.pre_discount_total, qv.discount_total, qv.net_total,
       qv.tax_total, qv.grand_total, qv.reason, qv.created_at,
       u.display_name AS created_by
     FROM quotation_versions qv
     LEFT JOIN users u ON u.id = qv.created_by_user_id
     WHERE qv.quotation_id = $1 AND qv.version_number = $2`,
    [quotationId, versionNumber]
  );
  if (!rows.length) return null;
  const version = rows[0];

  const { rows: lineRows } = await pool.query(
    `SELECT
       ql.id, ql.line_number, ql.description, ql.quantity, ql.unit_price,
       ql.line_base_value, ql.line_discount_percent, ql.allowed_discount_percent,
       ql.net_line_value, ql.tax_percent,
       p.name AS product_name, p.sku,
       pc.code AS category_code
     FROM quotation_lines ql
     JOIN products p ON p.id = ql.product_id
     JOIN product_categories pc ON pc.id = ql.category_id
     WHERE ql.quotation_version_id = $1
     ORDER BY ql.line_number`,
    [version.version_id]
  );
  version.lines = lineRows;
  return version;
}

export async function getQuotationAudit(quotationId, limit = 100) {
  const { rows } = await pool.query(
    `SELECT
       ae.id, ae.event_type, ae.occurred_at,
       ae.before_state, ae.after_state, ae.metadata,
       u.display_name AS actor_name,
       ae.aggregate_type
     FROM audit_events ae
     LEFT JOIN users u ON u.id = ae.actor_user_id
     WHERE ae.quotation_id = $1
     ORDER BY ae.occurred_at DESC
     LIMIT $2`,
    [quotationId, limit]
  );
  return rows;
}
