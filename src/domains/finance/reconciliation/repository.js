/**
 * Billing reconciliation data access (read-only SQL).
 */

const SELECT_INVOICE = `
  SELECT id,
         quotation_id    AS "quotationId",
         currency_code   AS "currencyCode",
         amount_due      AS "amountDue",
         amount_paid     AS "amountPaid",
         status
  FROM invoices
  WHERE id = $1
`;

// Lines of the invoice's quotation CURRENT version, each tagged one_time when no
// live subscription references it, otherwise recurring.
const SELECT_RECONCILIATION_LINES = `
  SELECT ql.id,
         ql.net_line_value AS "amount",
         CASE WHEN sub.id IS NULL THEN 'one_time' ELSE 'recurring' END AS kind
  FROM quotation_lines ql
  JOIN quotation_versions qv ON qv.id = ql.quotation_version_id
  JOIN quotations q           ON q.id = qv.quotation_id
  LEFT JOIN subscriptions sub ON sub.quotation_line_id = ql.id
  WHERE q.id = $1
    AND qv.version_number = q.current_version_number
  ORDER BY ql.line_number
`;

const SELECT_APPLIED_CREDITS = `
  SELECT COALESCE(SUM(applied_amount), 0)::text AS total
  FROM credit_notes
  WHERE invoice_id = $1 AND status = 'applied'
`;

export async function findInvoice(client, invoiceId) {
  const { rows } = await client.query(SELECT_INVOICE, [invoiceId]);
  return rows[0] ?? null;
}

export async function findReconciliationLines(client, quotationId) {
  const { rows } = await client.query(SELECT_RECONCILIATION_LINES, [quotationId]);
  return rows;
}

export async function findAppliedCredits(client, invoiceId) {
  const { rows } = await client.query(SELECT_APPLIED_CREDITS, [invoiceId]);
  return rows[0]?.total ?? '0';
}
