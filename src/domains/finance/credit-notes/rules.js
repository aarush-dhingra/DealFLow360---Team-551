/**
 * Credit-note domain rules (pure, no I/O).
 *
 * Rules encoded from the billing spec:
 *  - A credit note amount is always > 0.
 *  - It may never exceed the invoice's still-owed balance, so the invoice never
 *    goes below zero net.
 *  - Lifecycle: issued -> applied (or void while still issued). Applied is
 *    final.
 *  - When payments + applied credits cover the whole amount_due, the invoice
 *    status becomes 'credited'.
 *
 * All money values are decimal strings; exact math from shared/money.js.
 */

import { subtract, add, gt, gte } from '../../../shared/money.js';
import { Errors } from '../../../shared/errors.js';

/** Outstanding balance = amount_due - amount_paid - applied credits (>= 0). */
export function outstandingBalance(invoice) {
  const afterPaid = subtract(invoice.amountDue, invoice.amountPaid);
  const credits = invoice.appliedCredits ?? '0';
  return gt(afterPaid, credits) ? subtract(afterPaid, credits) : '0';
}

/**
 * Validate issuing a new credit note against an invoice.
 * Returns the resulting total of applied credits (issue keeps it 'issued';
 * this is the ceiling an apply may reach).
 */
export function validateCreditNoteIssue({ invoice, amount }) {
  const after = add(invoice.appliedCredits ?? '0', amount);
  if (gt(after, subtract(invoice.amountDue, invoice.amountPaid))) {
    throw Errors.validation('Credit note exceeds the outstanding balance.', {
      requested: amount,
      outstanding: subtract(invoice.amountDue, invoice.amountPaid)
    });
  }
  return after;
}

/**
 * Validate applying an issued credit note: current applied credits + this
 * amount may not exceed the still-owed balance.
 */
export function validateCreditNoteApply({ invoice, amount, alreadyApplied }) {
  const after = add(alreadyApplied, amount);
  const ceiling = subtract(invoice.amountDue, invoice.amountPaid);
  if (gt(after, ceiling)) {
    throw Errors.validation('Credit note application exceeds the outstanding balance.');
  }
  return after;
}

/**
 * Compute the invoice status after applying credits: 'credited' when applied
 * credits cover the whole still-owed balance, otherwise unchanged.
 */
export function invoiceStatusAfterCredit({ invoice, appliedCreditsTotal }) {
  const stillOwed = subtract(invoice.amountDue, invoice.amountPaid);
  return gte(appliedCreditsTotal, stillOwed) ? 'credited' : invoice.status;
}

/** Guard a credit-note lifecycle transition (issued -> applied | void). */
export function canTransitionCreditNote(fromStatus, toStatus) {
  const allowed = {
    issued: new Set(['applied', 'void']),
    applied: new Set([]),
    void: new Set([])
  };
  return allowed[fromStatus]?.has(toStatus) ?? false;
}
