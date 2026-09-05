/**
 * Billing reconciliation rules (pure, no I/O).
 *
 * Rules encoded (F6 plan):
 *  - An invoice's value is split into one-time vs recurring origins by looking
 *    at its source quotation's current-version lines: a line that a live
 *    subscription references is recurring; everything else is one-time.
 *  - Sub-totals are reported separately; outstanding and net-owed-after-credits
 *    keep the invoice's payment reality attached.
 */

import { add, subtract, gt } from '../../../shared/money.js';

export const LINE_KINDS = Object.freeze(['one_time', 'recurring']);

/**
 * lines: [{ kind: 'one_time' | 'recurring', amount }] (decimal strings)
 * invoice: { amountDue, amountPaid, currencyCode, status }
 * appliedCredits: total applied credit on the invoice (string)
 */
export function reconcileInvoice({ invoice, lines, appliedCredits = '0' }) {
  let oneTimeTotal = '0';
  let recurringTotal = '0';
  let oneTimeCount = 0;
  let recurringCount = 0;

  for (const line of lines) {
    if (line.kind === 'one_time') {
      oneTimeTotal = add(oneTimeTotal, line.amount);
      oneTimeCount += 1;
    } else if (line.kind === 'recurring') {
      recurringTotal = add(recurringTotal, line.amount);
      recurringCount += 1;
    } else {
      throw new Error(`Unknown line kind: ${line.kind}`);
    }
  }

  const outstanding = subtract(invoice.amountDue, invoice.amountPaid);
  const netOwedAfterCredits = gt(outstanding, appliedCredits)
    ? subtract(outstanding, appliedCredits)
    : '0';

  return {
    currencyCode: invoice.currencyCode,
    invoiceStatus: invoice.status,
    amountDue: invoice.amountDue,
    amountPaid: invoice.amountPaid,
    appliedCredits,
    outstanding,
    netOwedAfterCredits,
    oneTime: { count: oneTimeCount, total: oneTimeTotal },
    recurring: { count: recurringCount, total: recurringTotal },
    originatedTotal: add(oneTimeTotal, recurringTotal)
  };
}

/** Classify a quotation line as recurring when a live subscription references it. */
export function classifyLine({ lineId, amount, subscribedLineIds }) {
  return { kind: subscribedLineIds.has(lineId) ? 'recurring' : 'one_time', amount };
}
