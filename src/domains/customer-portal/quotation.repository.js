import { pool } from '../../infrastructure/database/pool.js';

// Resolve customer_id from the authenticated user's email via customer_contacts.
async function resolveCustomerId(userEmail) {
  const { rows } = await pool.query(
    `SELECT cc.customer_id FROM customer_contacts cc WHERE cc.email = $1 LIMIT 1`,
    [userEmail]
  );
  return rows[0]?.customer_id ?? null;
}

export async function getTierProgress(userEmail) {
  const customerId = await resolveCustomerId(userEmail);
  if (!customerId) return null;
  const { rows: customerRows } = await pool.query(`SELECT c.id,c.legal_name,c.tier_assignment_source,c.tier_assigned_at,ct.code AS tier_code,ct.display_name AS tier_name,COALESCE(ct.entitlement_discount_percent,0) AS entitlement_discount_percent
    FROM customers c LEFT JOIN customer_tiers ct ON ct.id=c.tier_id WHERE c.id=$1`, [customerId]);
  const { rows: totals } = await pool.query(`SELECT COALESCE(SUM(i.amount_paid-COALESCE(cn.applied_amount,0)),0) AS net_spend,count(*)::int AS completed_orders
    FROM invoices i LEFT JOIN (SELECT invoice_id,SUM(applied_amount) AS applied_amount FROM credit_notes WHERE status='applied' GROUP BY invoice_id) cn ON cn.invoice_id=i.id
    WHERE i.customer_id=$1 AND i.status='paid'`, [customerId]);
  const { rows: tiers } = await pool.query(`SELECT code,display_name,entitlement_discount_percent,qualification_spend,qualification_order_count FROM customer_tiers WHERE is_active ORDER BY CASE code WHEN 'bronze' THEN 1 WHEN 'silver' THEN 2 WHEN 'gold' THEN 3 END`);
  return { ...customerRows[0], ...totals[0], tiers };
}

export async function listPortalBilling(userEmail) {
  const customerId = await resolveCustomerId(userEmail);
  if (!customerId) return [];
  const { rows } = await pool.query(
    `SELECT i.id, i.invoice_number, i.status, i.currency_code, i.amount_due, i.amount_paid,
            i.issued_at, i.due_at, q.quote_number,
            COALESCE(credits.applied_total, 0) AS applied_credit_total,
            GREATEST(i.amount_due - i.amount_paid - COALESCE(credits.applied_total, 0), 0) AS outstanding_balance,
            COALESCE(credits.notes, '[]'::json) AS credit_notes
     FROM invoices i
     JOIN quotations q ON q.id=i.quotation_id
     LEFT JOIN LATERAL (
       SELECT SUM(cn.applied_amount) FILTER (WHERE cn.status='applied') AS applied_total,
              json_agg(json_build_object('id', cn.id, 'amount', cn.amount, 'status', cn.status, 'reason', cn.reason, 'created_at', cn.created_at) ORDER BY cn.created_at DESC) AS notes
       FROM credit_notes cn WHERE cn.invoice_id=i.id
     ) credits ON true
     WHERE i.customer_id=$1
     ORDER BY i.issued_at DESC, i.invoice_number DESC`,
    [customerId]
  );
  return rows;
}

export async function listPortalQuotes(userEmail, { status, limit = 50, offset = 0 } = {}) {
  const customerId = await resolveCustomerId(userEmail);
  if (!customerId) return [];

  const conditions = [`q.customer_id = $1`];
  const params = [customerId];

  if (status) {
    params.push(status);
    conditions.push(`q.status = $${params.length}`);
  }

  params.push(limit, offset);

  const { rows } = await pool.query(
    `SELECT
       q.id, q.quote_number, q.status, q.current_version_number,
       q.opened_at, q.last_activity_at, nc.owner_role AS negotiation_owner_role, nc.status AS negotiation_case_status, nc.updated_at AS negotiation_handoff_at,
       COALESCE(q.owner_display_name, u.display_name, 'Sales team') AS assigned_sales_rep_name,
       qv.currency_code, qv.pre_discount_total, qv.net_total, qv.grand_total
     FROM quotations q
     LEFT JOIN users u ON u.id=q.owner_user_id
     LEFT JOIN negotiation_cases nc ON nc.quotation_id=q.id AND nc.status='open'
     LEFT JOIN quotation_versions qv
       ON qv.quotation_id = q.id AND qv.version_number = q.current_version_number
     WHERE ${conditions.join(' AND ')}
       AND q.status NOT IN ('draft', 'cancelled', 'superseded')
     ORDER BY q.last_activity_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return { customerId, quotes: rows };
}

export async function getPortalQuotation(userEmail, quotationId) {
  const customerId = await resolveCustomerId(userEmail);
  if (!customerId) return null;

  const { rows } = await pool.query(
    `SELECT
       q.id, q.quote_number, q.status, q.current_version_number, q.lock_version,
       q.opened_at, q.last_activity_at, nc.owner_role AS negotiation_owner_role, nc.status AS negotiation_case_status, nc.updated_at AS negotiation_handoff_at,
       COALESCE(q.owner_display_name, u.display_name, 'Sales team') AS assigned_sales_rep_name,
       c.legal_name AS customer_name
     FROM quotations q
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN users u ON u.id=q.owner_user_id
     LEFT JOIN negotiation_cases nc ON nc.quotation_id=q.id AND nc.status='open'
     WHERE q.id = $1 AND q.customer_id = $2
       AND q.status NOT IN ('draft', 'cancelled', 'superseded')`,
    [quotationId, customerId]
  );
  if (!rows.length) return null;

  const quote = rows[0];

  const { rows: versionRows } = await pool.query(
    `SELECT
       qv.id AS version_id, qv.version_number, qv.discount_mode,
       qv.order_discount_percent, qv.currency_code,
       qv.pre_discount_total, qv.discount_total, qv.net_total,
       qv.tax_total, qv.grand_total, qv.created_at AS version_created_at
     FROM quotation_versions qv
     WHERE qv.quotation_id = $1 AND qv.version_number = $2`,
    [quotationId, quote.current_version_number]
  );
  quote.version = versionRows[0] ?? null;

  if (quote.version) {
    const { rows: lineRows } = await pool.query(
      `SELECT
         ql.id, ql.line_number, ql.description, ql.quantity, ql.unit_price,
         ql.line_base_value, ql.line_discount_percent, ql.net_line_value, ql.tax_percent,
         p.name AS product_name, p.sku,
         pc.display_name AS category_name
       FROM quotation_lines ql
       JOIN products p ON p.id = ql.product_id
       JOIN product_categories pc ON pc.id = ql.category_id
       WHERE ql.quotation_version_id = $1
       ORDER BY ql.line_number`,
      [quote.version.version_id]
    );
    quote.version.lines = lineRows;
  }

  return { customerId, quote };
}

export async function getPortalVersion(userEmail, quotationId, versionNumber) {
  const customerId = await resolveCustomerId(userEmail);
  if (!customerId) return null;

  // Verify quote belongs to this customer
  const { rows: ownerCheck } = await pool.query(
    `SELECT id FROM quotations WHERE id = $1 AND customer_id = $2`,
    [quotationId, customerId]
  );
  if (!ownerCheck.length) return null;

  const { rows } = await pool.query(
    `SELECT
       qv.id AS version_id, qv.version_number, qv.discount_mode,
       qv.order_discount_percent, qv.currency_code,
       qv.pre_discount_total, qv.discount_total, qv.net_total,
       qv.tax_total, qv.grand_total, qv.reason, qv.created_at
     FROM quotation_versions qv
     WHERE qv.quotation_id = $1 AND qv.version_number = $2`,
    [quotationId, versionNumber]
  );
  if (!rows.length) return null;

  const version = rows[0];

  const { rows: lineRows } = await pool.query(
    `SELECT
       ql.line_number, ql.description, ql.quantity, ql.unit_price,
       ql.line_base_value, ql.line_discount_percent, ql.net_line_value, ql.tax_percent,
       p.name AS product_name, p.sku
     FROM quotation_lines ql
     JOIN products p ON p.id = ql.product_id
     WHERE ql.quotation_version_id = $1
     ORDER BY ql.line_number`,
    [version.version_id]
  );
  version.lines = lineRows;

  return version;
}
