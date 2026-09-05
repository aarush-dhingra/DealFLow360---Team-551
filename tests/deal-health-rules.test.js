import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FINANCE_HEALTH_ACTIONS,
  ACTION_REQUIRES_REASON,
  isFinanceBand,
  stateOf,
  assertHealthActionAllowed,
  assertReasonSatisfiesAction,
  nextState
} from '../src/domains/finance/deal-health/rules.js';

const open = { acknowledgedAt: null, escalatedAt: null, resolvedAt: null };
const acknowledged = { acknowledgedAt: '2025-01-01', escalatedAt: null, resolvedAt: null };
const escalated = { acknowledgedAt: null, escalatedAt: '2025-01-01', resolvedAt: null };
const resolved = { acknowledgedAt: null, escalatedAt: null, resolvedAt: '2025-01-01' };

test('deal-health: stateOf derives handling state from timestamps', () => {
  assert.equal(stateOf(open), 'open');
  assert.equal(stateOf(acknowledged), 'acknowledged');
  assert.equal(stateOf(escalated), 'escalated');
  assert.equal(stateOf(resolved), 'resolved');
});

test('deal-health: only finance band is actionable here', () => {
  assert.equal(isFinanceBand({ band: 'finance' }), true);
  assert.equal(isFinanceBand({ band: 'manager' }), false);
});

test('deal-health: open allows acknowledge/escalate/resolve', () => {
  for (const action of FINANCE_HEALTH_ACTIONS) {
    assert.doesNotThrow(() => assertHealthActionAllowed({ state: 'open', action }));
  }
});

test('deal-health: acknowledged allows escalate/resolve but not re-acknowledge', () => {
  assert.throws(
    () => assertHealthActionAllowed({ state: 'acknowledged', action: 'acknowledge' }),
    (err) => err.code === 'INVALID_TRANSITION'
  );
  assert.doesNotThrow(() => assertHealthActionAllowed({ state: 'acknowledged', action: 'escalate' }));
});

test('deal-health: escalated allows resolve only', () => {
  assert.throws(
    () => assertHealthActionAllowed({ state: 'escalated', action: 'escalate' }),
    (err) => err.code === 'INVALID_TRANSITION'
  );
  assert.doesNotThrow(() => assertHealthActionAllowed({ state: 'escalated', action: 'resolve' }));
});

test('deal-health: resolved is terminal', () => {
  for (const action of FINANCE_HEALTH_ACTIONS) {
    assert.throws(
      () => assertHealthActionAllowed({ state: 'resolved', action }),
      (err) => err.code === 'INVALID_TRANSITION'
    );
  }
});

test('deal-health: resolve requires a reason', () => {
  assert.throws(
    () => assertReasonSatisfiesAction({ action: 'resolve', reason: '' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
  assert.doesNotThrow(() => assertReasonSatisfiesAction({ action: 'acknowledge' }));
});

test('deal-health: nextState maps actions', () => {
  assert.equal(nextState('acknowledge'), 'acknowledged');
  assert.equal(nextState('escalate'), 'escalated');
  assert.equal(nextState('resolve'), 'resolved');
  assert.equal(ACTION_REQUIRES_REASON.resolve, true);
});
