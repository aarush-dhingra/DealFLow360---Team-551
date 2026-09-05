/**
 * Deal-health Finance action rules (pure, no I/O).
 *
 * Rules encoded (MASTER_CONTEXT section 9, F7 plan):
 *  - Only finance-band assessments appear in the Finance queue.
 *  - Finance may acknowledge (open), escalate (open/acknowledged), or resolve
 *    (any non-terminal state). Resolve requires a reason.
 *  - A resolved alert is terminal. A health action NEVER touches price, risk,
 *    or approval history.
 *
 * State machine:
 *   open --acknowledge--> acknowledged --escalate--> escalated --resolve--> resolved
 *   open --escalate--> escalated
 *   (open | acknowledged | escalated) --resolve--> resolved
 */

import { Errors } from '../../../shared/errors.js';

export const FINANCE_HEALTH_ACTIONS = Object.freeze(['acknowledge', 'escalate', 'resolve']);

export const ACTION_REQUIRES_REASON = Object.freeze({
  acknowledge: false,
  escalate: false,
  resolve: true
});

export function isFinanceBand(assessment) {
  return assessment.band === 'finance';
}

export function stateOf(assessment) {
  if (assessment.resolvedAt) return 'resolved';
  if (assessment.escalatedAt) return 'escalated';
  if (assessment.acknowledgedAt) return 'acknowledged';
  return 'open';
}

const TRANSITIONS = {
  open: new Set(['acknowledge', 'escalate', 'resolve']),
  acknowledged: new Set(['escalate', 'resolve']),
  escalated: new Set(['resolve']),
  resolved: new Set([])
};

export function assertHealthActionAllowed({ state, action }) {
  if (!FINANCE_HEALTH_ACTIONS.includes(action)) {
    throw Errors.validation(`Unknown finance health action: ${action}`);
  }
  if (!TRANSITIONS[state]?.has(action)) {
    throw Errors.invalidTransition(
      `Cannot "${action}" a deal-health assessment in state "${state}".`
    );
  }
  return true;
}

export function assertReasonSatisfiesAction({ action, reason }) {
  if (ACTION_REQUIRES_REASON[action] && (!reason || reason.trim() === '')) {
    throw Errors.validation('reason is required to resolve a deal-health alert');
  }
  return true;
}

export function nextState(action) {
  switch (action) {
    case 'acknowledge':
      return 'acknowledged';
    case 'escalate':
      return 'escalated';
    case 'resolve':
      return 'resolved';
    default:
      throw new Error(`Unknown action: ${action}`);
  }
}
