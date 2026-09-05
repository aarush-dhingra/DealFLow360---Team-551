/**
 * Payments data access (parameterized SQL only).
 *
 * The base invoices table has NO updated_at column; payment writes therefore
 * update only amount_paid/status and rely on invoices.lock_version (added by
 * the finance schema migration) for optimistic concurrency.
 */

const SELECT_INVOICE = `
  SELECT id,
         quotation_id    AS "quotationId",
         customer_id     AS "customerId",
         amount_due      AS "amountDue",
         amount_paid     AS "amountPaid",
         status,
         lock_version    AS "lockVersion"
  FROM invoices
  WHERE id = $1
`;

const SELECT_APPLIED_CREDITS = `
  SELECT COALESCE(SUM(applied_amount), 0)::text AS total
  FROM credit_notes
  WHERE invoice_id = $1 AND status = 'applied'
`;

const INSERT_PAYMENT = `
  INSERT INTO payments (invoice_id, amount, payment_method, external_reference, paid_at)
  VALUES ($1, $2, $3, $4, $5)
  RETURNING id
`;

// Optimistic update: amount_paid + status only when lock_version matches.
const APPLY_PAYMENT = `
  UPDATE invoices
  SET amount_paid = $2,
      status = $3,
      lock_version = lock_version + 1
  WHERE id = $1 AND lock_version = $4
  RETURNING id
`;

// Void: status only, guarded by lock_version.
const VOID_INVOICE = `
  UPDATE invoices
  SET status = 'void',
      lock_version = lock_version + 1
  WHERE id = $1 AND lock_version = $2
  RETURNING id
`;

export async function findInvoice(client, invoiceId) {
  const { rows } = await client.query(SELECT_INVOICE, [invoiceId]);
  return rows[0] ?? null;
}

export async function findAppliedCredits(client, invoiceId) {
  const { rows } = await client.query(SELECT_APPLIED_CREDITS, [invoiceId]);
  return rows[0]?.total ?? '0';
}

export async function insertPayment(client, { invoiceId, amount, method, externalReference, paidAt }) {
  const { rows } = await client.query(INSERT_PAYMENT, [
    invoiceId,
    amount,
    method,
    externalReference ?? null,
    paidAt
  ]);
  return rows[0] ?? null;
}

export async function applyPayment(client, { invoiceId, amountPaid, status, expectedLockVersion }) {
  const { rows } = await client.query(APPLY_PAYMENT, [
    invoiceId,
    amountPaid,
    status,
    expectedLockVersion
  ]);
  return rows[0] ?? null;
}

export async function voidInvoice(client, { invoiceId, expectedLockVersion }) {
  const { rows } = await client.query(VOID_INVOICE, [invoiceId, expectedLockVersion]);
  return rows[0] ?? null;
}
