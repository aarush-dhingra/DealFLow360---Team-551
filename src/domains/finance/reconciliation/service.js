/**
 * Billing reconciliation service — one-time vs recurring split of an invoice.
 * Read-only; reports over committed data, no audit needed for a plain read.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { Errors } from '../../../shared/errors.js';
import { reconcileInvoice } from './rules.js';
import * as repo from './repository.js';

export async function reconcileInvoiceById({ invoiceId }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw Errors.validation('invoiceId is required');

  return withTransaction(async (client) => {
    const invoice = await repo.findInvoice(client, invoiceId);
    if (!invoice) throw Errors.notFound('Invoice not found.');

    const [lines, appliedCredits] = await Promise.all([
      repo.findReconciliationLines(client, invoice.quotationId),
      repo.findAppliedCredits(client, invoiceId)
    ]);

    return reconcileInvoice({
      invoice,
      lines: lines.map((l) => ({ kind: l.kind, amount: l.amount })),
      appliedCredits
    });
  });
}
