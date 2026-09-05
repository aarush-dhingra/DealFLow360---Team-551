/**
 * Credit-notes data access (parameterized SQL only).
 *
 * Uses the credit_notes.status / applied_amount columns added by the finance
 * schema migration, plus invoices.lock_version for guarded status flips. The
 * base invoices table has no updated_at column, so updates never write it.
 */

const SELECT_INVOICE = `
  SELECT id,
         quotation_id    AS "quotationId",
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

const INSERT_CREDIT_NOTE = `
  INSERT INTO credit_notes (invoice_id, amount, reason, created_by_user_id, status, applied_amount)
  VALUES ($1, $2, $3, $4, 'issued', 0)
  RETURNING id
`;

const SELECT_CREDIT_NOTE = `
  SELECT id,
         invoice_id          AS "invoiceId",
         amount,
         reason,
         status,
         applied_amount      AS "appliedAmount"
  FROM credit_notes
  WHERE id = $1
`;

// Apply: issued -> applied, applied_amount := amount. Single-use guard.
const APPLY_CREDIT_NOTE = `
  UPDATE credit_notes
  SET status = 'applied',
      applied_amount = amount
  WHERE id = $1 AND status = 'issued'
  RETURNING id
`;

// Flip invoice status to credited only when still on the expected lock_version.
const UPDATE_INVOICE_STATUS = `
  UPDATE invoices
  SET status = $2,
      lock_version = lock_version + 1
  WHERE id = $1 AND lock_version = $3
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

export async function insertCreditNote(client, { invoiceId, amount, reason, createdByUserId }) {
  const { rows } = await client.query(INSERT_CREDIT_NOTE, [
    invoiceId,
    amount,
    reason,
    createdByUserId
  ]);
  return rows[0] ?? null;
}

export async function findCreditNote(client, creditNoteId) {
  const { rows } = await client.query(SELECT_CREDIT_NOTE, [creditNoteId]);
  return rows[0] ?? null;
}

export async function applyCreditNote(client, creditNoteId) {
  const { rows } = await client.query(APPLY_CREDIT_NOTE, [creditNoteId]);
  return rows[0] ?? null;
}

export async function updateInvoiceStatus(client, { invoiceId, status, expectedLockVersion }) {
  const { rows } = await client.query(UPDATE_INVOICE_STATUS, [
    invoiceId,
    status,
    expectedLockVersion
  ]);
  return rows[0] ?? null;
}
