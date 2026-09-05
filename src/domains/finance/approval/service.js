/**
 * Finance approval application service.
 *
 * Orchestrates the approval decision in one transaction:
 *  1. load the approval instance and the quotation named in the URL,
 *  2. enforce that the URL quotation id matches the instance's quotation,
 *  3. validate domain rules (role, pending, current version, manager first),
 *  4. apply the guarded decision + quote transition with optimistic locking,
 *  5. persist audit + outbox rows atomically.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import {
  FINANCE_DECISION_ACTIONS,
  validateFinanceDecision,
  buildDecisionRecords
} from './rules.js';
import * as repo from './repository.js';

/**
 * Decide a pending Finance approval step for the current quote version.
 *
 * @param {object} input
 * @param {string} input.quotationId        id from the URL path
 * @param {string} input.approvalInstanceId id from the URL path
 * @param {'approve'|'reject'|'return_for_revision'} input.action
 * @param {string} input.reason
 * @param {{userId: string, roles: string[]}} input.principal
 */
export async function decideApproval({ quotationId, approvalInstanceId, action, reason, principal }) {
  if (!FINANCE_DECISION_ACTIONS.includes(action)) {
    throw Errors.validation(`action must be one of: ${FINANCE_DECISION_ACTIONS.join(', ')}`);
  }
  if (!reason || reason.trim() === '') {
    throw Errors.validation('reason is required');
  }

  return withTransaction(async (client) => {
    const instance = await repo.findInstance(client, approvalInstanceId);
    if (!instance) throw Errors.notFound('Approval instance not found.');
    if (instance.quotationId !== quotationId) {
      // URL quotation must match the instance's quotation.
      throw Errors.validation('Approval instance does not belong to the given quotation.');
    }

    const quote = await repo.findQuote(client, quotationId);
    if (!quote) throw Errors.notFound('Quotation not found.');

    const currentVersionId = await repo.findCurrentVersionId(client, quotationId);
    if (!currentVersionId) throw Errors.notFound('Quotation current version not found.');

    // manager_then_finance: the immediately prior step must already be approved.
    const priorStep =
      instance.sequenceNumber > 1
        ? await repo.findPriorStep(client, instance.quotationVersionId, instance.sequenceNumber)
        : null;

    validateFinanceDecision({
      instance, // stored quotationVersionId is compared against the current one
      quote: { id: quote.id, currentVersionId, status: quote.status },
      priorStep
    });

    const decidedAt = new Date().toISOString();
    const { quoteStatusAfter, instanceStatusAfter, auditEntry, outboxEntry } = buildDecisionRecords({
      action,
      instance,
      quote,
      actor: { userId: principal.userId, requestId: principal.requestId },
      reason,
      decidedAt
    });

    // Guarded decision + optimistic quote transition.
    const decided = await repo.decideInstance(client, {
      id: instance.id,
      status: instanceStatusAfter,
      decisionByUserId: principal.userId,
      reason
    });
    if (!decided) throw Errors.staleVersion('Approval instance was already decided.');

    const updatedQuote = await repo.updateQuoteStatus(client, {
      quotationId,
      status: quoteStatusAfter,
      expectedLockVersion: quote.lockVersion
    });
    if (!updatedQuote) {
      throw Errors.staleVersion('Quotation changed concurrently; reload and retry.');
    }

    await repo.insertApprovalAction(client, {
      instanceId: instance.id,
      actorUserId: principal.userId,
      action,
      reason
    });

    // Audit + outbox committed with the same transaction.
    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record(auditEntry);
    outbox.record(outboxEntry);
    await audit.flush();
    await outbox.flush();

    return {
      approvalInstanceId: instance.id,
      quotationId,
      action,
      quoteStatus: quoteStatusAfter,
      instanceStatus: instanceStatusAfter,
      decidedAt
    };
  });
}
