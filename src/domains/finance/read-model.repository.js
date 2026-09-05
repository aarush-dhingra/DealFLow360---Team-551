// Read models used by internal dashboards. All filters are parameterized.

export async function listFulfillmentOrders(client, { limit, offset }) {
  const { rows } = await client.query(
    `SELECT fo.id,
            fo.quotation_id AS "quotationId",
            q.quote_number AS "quoteNumber",
            c.legal_name AS "customerName",
            fo.status,
            fo.allocation_mode AS "allocationMode",
            fo.created_at AS "createdAt",
            fo.updated_at AS "updatedAt",
            COUNT(DISTINCT fa.warehouse_id) FILTER (WHERE fa.status = 'allocated')::int AS "warehouseCount",
            ARRAY_REMOVE(ARRAY_AGG(DISTINCT w.name) FILTER (WHERE fa.status = 'allocated'), NULL) AS warehouses,
            COUNT(*) FILTER (WHERE fa.status = 'backordered')::int AS "backorderCount"
     FROM fulfillment_orders fo
     JOIN quotations q ON q.id = fo.quotation_id
     JOIN customers c ON c.id = q.customer_id
     LEFT JOIN fulfillment_allocations fa ON fa.fulfillment_order_id = fo.id
     LEFT JOIN warehouses w ON w.id = fa.warehouse_id
     GROUP BY fo.id, q.quote_number, c.legal_name
     ORDER BY fo.updated_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset]
  );
  return rows;
}

export async function countFulfillmentOrders(client) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS count FROM fulfillment_orders`);
  return rows[0].count;
}

export async function listInvoices(client, { limit, offset, status }) {
  const params = [];
  const where = [];
  if (status) {
    params.push(status);
    where.push(`i.status = $${params.length}`);
  }
  params.push(limit, offset);
  const { rows } = await client.query(
    `SELECT i.id,
            i.invoice_number AS "invoiceNumber",
            i.quotation_id AS "quotationId",
            q.quote_number AS "quoteNumber",
            c.legal_name AS "customerName",
            i.currency_code AS "currencyCode",
            i.amount_due AS "amountDue",
            i.amount_paid AS "amountPaid",
            i.status,
            i.due_at AS "dueAt",
            i.issued_at AS "issuedAt",
            i.created_at AS "createdAt",
            COUNT(DISTINCT p.id)::int AS "paymentCount",
            COALESCE(SUM(CASE WHEN cn.status = 'applied' THEN cn.applied_amount ELSE 0 END), 0) AS "appliedCreditTotal"
     FROM invoices i
     JOIN quotations q ON q.id = i.quotation_id
     JOIN customers c ON c.id = i.customer_id
     LEFT JOIN payments p ON p.invoice_id = i.id
     LEFT JOIN credit_notes cn ON cn.invoice_id = i.id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY i.id, q.quote_number, c.legal_name
     ORDER BY i.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  );
  return rows;
}

export async function countInvoices(client, { status }) {
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS count FROM invoices ${status ? 'WHERE status = $1' : ''}`,
    status ? [status] : []
  );
  return rows[0].count;
}

export async function findInvoiceDetail(client, invoiceId) {
  const { rows } = await client.query(
    `SELECT i.id,
            i.invoice_number AS "invoiceNumber",
            i.quotation_id AS "quotationId",
            q.quote_number AS "quoteNumber",
            c.legal_name AS "customerName",
            i.currency_code AS "currencyCode",
            i.amount_due AS "amountDue",
            i.amount_paid AS "amountPaid",
            i.status,
            i.due_at AS "dueAt",
            i.issued_at AS "issuedAt",
            i.created_at AS "createdAt",
            COALESCE((SELECT SUM(applied_amount) FROM credit_notes WHERE invoice_id = i.id AND status = 'applied'), 0) AS "appliedCreditTotal"
     FROM invoices i
     JOIN quotations q ON q.id = i.quotation_id
     JOIN customers c ON c.id = i.customer_id
     WHERE i.id = $1`,
    [invoiceId]
  );
  return rows[0] ?? null;
}

export async function findInvoicePayments(client, invoiceId) {
  const { rows } = await client.query(
    `SELECT id, amount, payment_method AS "paymentMethod", external_reference AS "externalReference", paid_at AS "paidAt", created_at AS "createdAt"
     FROM payments WHERE invoice_id = $1 ORDER BY paid_at DESC`,
    [invoiceId]
  );
  return rows;
}

export async function findInvoiceCreditNotes(client, invoiceId) {
  const { rows } = await client.query(
    `SELECT id, amount, applied_amount AS "appliedAmount", status, reason, created_at AS "createdAt"
     FROM credit_notes WHERE invoice_id = $1 ORDER BY created_at DESC`,
    [invoiceId]
  );
  return rows;
}

export async function reportSummary(client, filters) {
  const params = [];
  const where = [];
  const add = (condition, value) => {
    params.push(value);
    where.push(condition.replace('?', `$${params.length}`));
  };
  if (filters.from) add('q.created_at >= ?', filters.from);
  if (filters.to) add('q.created_at < ?', filters.to);
  if (filters.ownerUserId) add('q.owner_user_id = ?', filters.ownerUserId);
  if (filters.approvalStatus) add('q.status = ?', filters.approvalStatus);
  if (filters.productId) add(`EXISTS (SELECT 1 FROM quotation_versions rv JOIN quotation_lines rl ON rl.quotation_version_id = rv.id WHERE rv.quotation_id = q.id AND rv.version_number = q.current_version_number AND rl.product_id = ?)`, filters.productId);
  if (filters.categoryId) add(`EXISTS (SELECT 1 FROM quotation_versions rv JOIN quotation_lines rl ON rl.quotation_version_id = rv.id WHERE rv.quotation_id = q.id AND rv.version_number = q.current_version_number AND rl.category_id = ?)`, filters.categoryId);
  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await client.query(
    `WITH filtered_quotes AS (
       SELECT q.id, q.status, q.current_version_number
       FROM quotations q
       ${filterSql}
     )
     SELECT COUNT(*)::int AS "quotesCreated",
            COALESCE(SUM(qv.grand_total), 0) AS "quotedValue",
            COALESCE((
              SELECT AVG(EXTRACT(EPOCH FROM (ai.decided_at - ai.created_at)) / 3600)
              FROM approval_instances ai
              WHERE ai.quotation_id IN (SELECT id FROM filtered_quotes)
                AND ai.decided_at IS NOT NULL
            ), 0) AS "averageApprovalHours",
            COUNT(*) FILTER (WHERE fq.status IN ('pending_manager_approval', 'pending_finance_approval'))::int AS "pendingApprovalCount"
     FROM filtered_quotes fq
     LEFT JOIN quotation_versions qv ON qv.quotation_id = fq.id AND qv.version_number = fq.current_version_number`,
    params
  );
  return rows[0];
}
