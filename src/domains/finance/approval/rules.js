/**
 * Finance approval domain rules (pure, no I/O).
 *
 * Encodes the approval-routing safety rules:
 *  - Finance decides ONLY a pending approval instance whose required role is
 *    finance_operations.
 *  - The instance must target the quotation's CURRENT version.
 *  - A manager_then_finance chain requires the prior Manager step approved.
 *  - The decision action maps to a quotation status transition.
 *  - Every decision is logged with actor, timestamp, and reason.
 *
 * Domain functions are pure so they can be unit-tested without a database.
 */

import { Errors } from '../../../shared/errors.js';

/** Finance decision actions. */
export const FINANCE_DECISION_ACTIONS = Object.freeze([
  'approve',
  'reject',
  'return_for_revision'
]);

/** Approval instance statuses that a Finance step may still be decided in. */
const DECIDABLE_INSTANCE_STATUS = 'pending';

/**
 * Validate a finance decision preconditions.
 *
 * @param {object} params
 * @param {object} params.instance approval_instances row:
 *   { requiredRole, status, quotationVersionId }
 * @param {object} params.quote quotations row: { currentVersionId }
 * @param {object|null} params.priorStep the preceding approval instance (the
 *   Manager step in a manager_then_finance chain), or null when none exists.
 *
 * Throws a stable AppError on the first violated rule.
 */
export function validateFinanceDecision({ instance, quote, priorStep }) {
  if (instance.requiredRole !== 'finance_operations') {
    throw Errors.forbidden('This approval step is not a Finance step.');
  }
  if (instance.status !== DECIDABLE_INSTANCE_STATUS) {
    throw Errors.invalidTransition(
      `Approval instance is ${instance.status}; only pending instances can be decided.`
    );
  }
  // The decision must target the CURRENT quote version.
  if (instance.quotationVersionId !== quote.currentVersionId) {
    throw Errors.staleVersion(
      'This approval instance belongs to an older quotation version.'
    );
  }
  // manager_then_finance: the Manager step must have already approved.
  if (priorStep && priorStep.status !== 'approved') {
    throw Errors.invalidTransition(
      'The prior Manager approval must be approved before Finance can decide.'
    );
  }
}

/**
 * Map a finance decision action to the quotation's resulting status.
 * The quotation must currently be awaiting Finance approval.
 */
export function quoteStatusAfterFinanceDecision(action, currentStatus) {
  if (currentStatus !== 'pending_finance_approval') {
    throw Errors.invalidTransition(
      `Finance cannot decide a quotation in status "${currentStatus}".`
    );
  }
  switch (action) {
    case 'approve':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'return_for_revision':
      return 'returned_for_revision';
    default:
      throw Errors.validation(`Unknown finance decision action: ${action}`);
  }
}

/**
 * Build the immutable audit/outbox payload records for an applied decision.
 * Pure — returns data; the caller persists inside the transaction.
 */
export function buildDecisionRecords({ action, instance, quote, actor, reason, decidedAt }) {
  const quoteStatusAfter = quoteStatusAfterFinanceDecision(action, quote.status);
  const instanceStatusAfter =
    action === 'approve'
      ? 'approved'
      : action === 'reject'
        ? 'rejected'
        : 'returned_for_revision';

  const auditEntry = {
    aggregateType: 'approval_instance',
    aggregateId: instance.id,
    quotationId: quote.id,
    quotationVersionId: instance.quotationVersionId,
    eventType: `finance.approval.${action}`,
    actorUserId: actor.userId,
    requestId: actor.requestId ?? null,
    beforeState: { instanceStatus: 'pending', quoteStatus: quote.status },
    afterState: { instanceStatus: instanceStatusAfter, quoteStatus: quoteStatusAfter },
    metadata: { reason }
  };

  const outboxEntry = {
    aggregateType: 'approval_instance',
    aggregateId: instance.id,
    eventType: `finance.approval.${action}`,
    payload: {
      quotationId: quote.id,
      quotationVersionId: instance.quotationVersionId,
      quoteStatusAfter,
      decidedByUserId: actor.userId,
      decidedAt
    }
  };

  return { quoteStatusAfter, instanceStatusAfter, auditEntry, outboxEntry };
}
