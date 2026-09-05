import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCE_DECISION_ACTIONS,
  validateFinanceDecision,
  quoteStatusAfterFinanceDecision,
  buildDecisionRecords
} from '../src/domains/finance/approval/rules.js';

const pendingFinance = {
  id: 'ai-2',
  quotationId: 'q-1',
  quotationVersionId: 'qv-2',
  sequenceNumber: 2,
  requiredRole: 'finance_operations',
  status: 'pending'
};

const quote = { id: 'q-1', currentVersionId: 'qv-2', status: 'pending_finance_approval' };

test('approval: finance may decide a pending finance instance on the current version', () => {
  assert.doesNotThrow(() =>
    validateFinanceDecision({ instance: pendingFinance, quote, priorStep: null })
  );
});

test('approval: sales_manager instance is not decidable by finance', () => {
  assert.throws(
    () =>
      validateFinanceDecision({
        instance: { ...pendingFinance, requiredRole: 'sales_manager' },
        quote,
        priorStep: null
      }),
    (err) => err.code === 'FORBIDDEN'
  );
});

test('approval: already-decided instance is rejected', () => {
  assert.throws(
    () =>
      validateFinanceDecision({
        instance: { ...pendingFinance, status: 'approved' },
        quote,
        priorStep: null
      }),
    (err) => err.code === 'INVALID_TRANSITION'
  );
});

test('approval: stale version (instance targets older quote version) is rejected', () => {
  assert.throws(
    () =>
      validateFinanceDecision({
        instance: { ...pendingFinance, quotationVersionId: 'qv-1' },
        quote,
        priorStep: null
      }),
    (err) => err.code === 'STALE_VERSION'
  );
});

test('approval: manager_then_finance requires the manager step already approved', () => {
  const managerPending = { status: 'pending' };
  const managerApproved = { status: 'approved' };
  assert.throws(
    () => validateFinanceDecision({ instance: pendingFinance, quote, priorStep: managerPending }),
    (err) => err.code === 'INVALID_TRANSITION'
  );
  assert.doesNotThrow(() =>
    validateFinanceDecision({ instance: pendingFinance, quote, priorStep: managerApproved })
  );
});

test('approval: status transitions per action', () => {
  assert.equal(quoteStatusAfterFinanceDecision('approve', 'pending_finance_approval'), 'approved');
  assert.equal(quoteStatusAfterFinanceDecision('reject', 'pending_finance_approval'), 'rejected');
  assert.equal(
    quoteStatusAfterFinanceDecision('return_for_revision', 'pending_finance_approval'),
    'returned_for_revision'
  );
});

test('approval: finance cannot decide a quote not awaiting finance', () => {
  assert.throws(
    () => quoteStatusAfterFinanceDecision('approve', 'draft'),
    (err) => err.code === 'INVALID_TRANSITION'
  );
});

test('approval: buildDecisionRecords produces audit/outbox payloads', () => {
  const records = buildDecisionRecords({
    action: 'approve',
    instance: pendingFinance,
    quote,
    actor: { userId: 'u-fin', requestId: 'r-1' },
    reason: 'Approved within finance authority',
    decidedAt: '2025-01-01T00:00:00.000Z'
  });
  assert.equal(records.quoteStatusAfter, 'approved');
  assert.equal(records.instanceStatusAfter, 'approved');
  assert.equal(records.auditEntry.eventType, 'finance.approval.approve');
  assert.equal(records.auditEntry.actorUserId, 'u-fin');
  assert.equal(records.auditEntry.metadata.reason, 'Approved within finance authority');
  assert.equal(records.outboxEntry.payload.quoteStatusAfter, 'approved');
  assert.deepEqual(FINANCE_DECISION_ACTIONS, ['approve', 'reject', 'return_for_revision']);
});
