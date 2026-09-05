/**
 * Payment domain rules (pure, no I/O).
 *
 * Rules encoded from the billing spec:
 *  - A payment is always > 0.
 *  - A payment may never exceed the outstanding balance of the invoice
 *    (amount_due - amount_paid - applied credits).
 *  - The invoice advances issued -> partially_paid -> paid as the running paid
 *    total covers the balance.
 *  - An invoice with no payments and no applied credits can be voided.
 *
 * All money values are decimal strings; exact math from shared/money.js.
 */

import { subtract, add, gt, gte } from '../../../shared/money.js';
import { Errors } from '../../../shared/errors.js';

/** Invoice statuses that may still accept a payment. */
export const PAYABLE_STATUSES = new Set(['issued', 'overdue', 'partially_paid']);

/** Outstanding balance = amount_due - amount_paid - applied credits (>= 0). */
export function outstandingBalance(invoice) {
  const afterPaid = subtract(invoice.amountDue, invoice.amountPaid);
  const credits = invoice.appliedCredits ?? '0';
  return gt(afterPaid, credits) ? subtract(afterPaid, credits) : '0';
}

/**
 * Validate a payment and compute the resulting invoice state.
 * Returns { amountPaidAfter, statusAfter }.
 * Throws INVALID_TRANSITION for non-payable invoices and OVERPAYMENT when the
 * payment exceeds the outstanding balance.
 */
export function validatePayment({ invoice, amount }) {
  if (!PAYABLE_STATUSES.has(invoice.status)) {
    throw Errors.invalidTransition(`Invoice status "${invoice.status}" cannot accept payments.`);
  }
  const outstanding = outstandingBalance(invoice);
  if (gt(amount, outstanding)) {
    throw Errors.validation('Payment exceeds the outstanding balance.', { amount, outstanding });
  }
  const amountPaidAfter = add(invoice.amountPaid, amount);
  const credits = invoice.appliedCredits ?? '0';
  const fullyCovered = gte(add(amountPaidAfter, credits), invoice.amountDue);
  return { amountPaidAfter, statusAfter: fullyCovered ? 'paid' : 'partially_paid' };
}

/**
 * Whether an invoice may be voided: no payments yet, no applied credits, and it
 * is still in an open status.
 */
export function canVoidInvoice(invoice) {
  const unpaid = !gt(invoice.amountPaid, '0');
  const uncredited = !gt(invoice.appliedCredits ?? '0', '0');
  const open = invoice.status === 'issued' || invoice.status === 'overdue';
  return unpaid && uncredited && open;
}
