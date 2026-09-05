/**
 * Deal-health service — Finance queue + actions in one transaction per action
 * (guarded update + audit + outbox). Never touches price/risk/approval state.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import {
  FINANCE_HEALTH_ACTIONS,
  isFinanceBand,
  stateOf,
  assertHealthActionAllowed,
  assertReasonSatisfiesAction,
  nextState
} from './rules.js';
import * as repo from './repository.js';

export async function listFinanceQueue({ limit } = {}) {
  const cap = Math.min(Math.max(Number(limit) || 100, 1), 500);
  return withTransaction(async (client) => repo.findFinanceQueue(client, cap));
}

export async function actOnAssessment({ assessmentId, action, reason, principal }) {
  if (!assessmentId || typeof assessmentId !== 'string') {
    throw Errors.validation('assessmentId is required');
  }
  if (!FINANCE_HEALTH_ACTIONS.includes(action)) {
    throw Errors.validation(`action must be one of: ${FINANCE_HEALTH_ACTIONS.join(', ')}`);
  }
  assertReasonSatisfiesAction({ action, reason });

  return withTransaction(async (client) => {
    const assessment = await repo.findAssessment(client, assessmentId);
    if (!assessment) throw Errors.notFound('Deal-health assessment not found.');
    if (!isFinanceBand(assessment)) {
      throw Errors.invalidTransition(
        `Assessment band is "${assessment.band}"; only finance-band alerts can be handled here.`
      );
    }

    const before = stateOf(assessment);
    assertHealthActionAllowed({ state: before, action });

    const at = new Date().toISOString();
    const applied = await repo.applyAction(client, {
      assessmentId,
      action,
      actorUserId: principal.userId,
      at
    });
    if (!applied) {
      throw Errors.staleVersion(
        'Deal-health assessment changed concurrently or the action is not allowed in its current state.'
      );
    }

    const after = nextState(action);
    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'deal_health_assessment',
      aggregateId: assessmentId,
      quotationId: assessment.quotationId,
      eventType: `health.finance.${action}`,
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { healthState: before },
      afterState: { healthState: after },
      metadata: { reason: reason ?? null }
    });
    outbox.record({
      aggregateType: 'deal_health_assessment',
      aggregateId: assessmentId,
      eventType: `health.finance.${action}`,
      payload: {
        assessmentId,
        quotationId: assessment.quotationId,
        action,
        healthState: after,
        actedByUserId: principal.userId,
        actedAt: at,
        reason: reason ?? null
      }
    });
    await audit.flush();
    await outbox.flush();

    return { assessmentId, quotationId: assessment.quotationId, action, healthState: after, actedAt: at };
  });
}
