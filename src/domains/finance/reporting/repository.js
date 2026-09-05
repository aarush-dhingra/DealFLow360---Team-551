/**
 * Finance reporting data access (read-only SQL).
 */

const SELECT_REVENUE = `
  SELECT date_trunc('day', COALESCE(i.issued_at, i.created_at))::date AS "invoiceDate",
         COUNT(*)::int AS "invoiceCount",
         COALESCE(SUM(i.amount_due), 0)::text AS "amountDue",
         COALESCE(SUM(i.amount_paid), 0)::text AS "amountPaid"
  FROM invoices i
  JOIN quotations q ON q.id = i.quotation_id
  WHERE ($1::date IS NULL OR COALESCE(i.issued_at, i.created_at)::date >= $1)
    AND ($2::date IS NULL OR COALESCE(i.issued_at, i.created_at)::date <= $2)
    AND ($3::uuid IS NULL OR q.owner_user_id = $3)
    AND ($4::text IS NULL OR i.status = $4)
  GROUP BY 1
  ORDER BY 1
`;

const SELECT_OUTSTANDING = `
  SELECT i.invoice_number AS "invoiceNumber",
         c.legal_name     AS "customerName",
         COALESCE(i.issued_at, i.created_at)::date AS "invoiceDate",
         i.status,
         i.amount_due::text AS "amountDue",
         i.amount_paid::text AS "amountPaid",
         q.owner_user_id  AS "ownerUserId"
  FROM invoices i
  JOIN customers c ON c.id = i.customer_id
  JOIN quotations q ON q.id = i.quotation_id
  WHERE i.status IN ('issued', 'partially_paid', 'overdue')
    AND ($1::uuid IS NULL OR q.owner_user_id = $1)
  ORDER BY COALESCE(i.issued_at, i.created_at)
`;

export async function selectRevenue(db, { fromDate, toDate, ownerUserId, status }) {
  const { rows } = await db.query(SELECT_REVENUE, [fromDate, toDate, ownerUserId, status]);
  return rows;
}

export async function selectOutstandingInvoices(db, { ownerUserId }) {
  const { rows } = await db.query(SELECT_OUTSTANDING, [ownerUserId]);
  return rows;
}
