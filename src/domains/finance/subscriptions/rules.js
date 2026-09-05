/**
 * Subscription lifecycle rules (pure, no I/O).
 *
 * Rules encoded (F5 plan / MASTER_CONTEXT section 11):
 *  - Cancellation is allowed only from active/paused/pending; once cancelled or
 *    expired it is terminal.
 *  - Quantity changes are allowed only while active/paused.
 *  - Cancellation refund = unused fraction of the current prepaid period per
 *    the plan's cancellation_policy.
 */

import { Errors } from '../../../shared/errors.js';
import { prorateUnusedAmount, applyCancellationPolicy, daysBetween, unusedDays, periodContaining } from './proration.js';

export function canCancel(status) {
  return ['active', 'paused', 'pending'].includes(status);
}

export function canChangeQuantity(status) {
  return ['active', 'paused'].includes(status);
}

export function assertCanCancel(status) {
  if (!canCancel(status)) {
    throw Errors.invalidTransition(`Subscription status "${status}" cannot be cancelled.`);
  }
  return true;
}

export function assertCanChangeQuantity(status) {
  if (!canChangeQuantity(status)) {
    throw Errors.invalidTransition(`Subscription status "${status}" cannot change quantity.`);
  }
  return true;
}

/**
 * Refund for cancelling at `atIso` based on the full prepaid amount of the
 * period containing `atIso`. Returns a decimal string >= 0.
 */
export function computeCancellationRefund({
  anchorIso,
  intervalUnit,
  atIso,
  prepaidAmount,
  cancellationPolicy
}) {
  if (!prepaidAmount || prepaidAmount === '0') return '0';
  const { startIso, endIso } = periodContaining(anchorIso, intervalUnit, atIso);
  const total = daysBetween(startIso, endIso);
  const used = Math.max(0, total - unusedDays({ startIso, endIso, atIso }));
  const computed = prorateUnusedAmount({ amount: prepaidAmount, startIso, endIso, atIso });
  return applyCancellationPolicy({
    policy: cancellationPolicy,
    computedRefund: computed,
    usedDaysValue: used,
    totalDays: total
  });
}
