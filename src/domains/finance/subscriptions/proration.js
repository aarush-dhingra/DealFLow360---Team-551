/**
 * Subscription proration rules (pure, no I/O).
 *
 * Rules encoded (MASTER_CONTEXT.md section 11 "Subscription and billing"):
 *  - Proration uses DAY-PRECISION over the plan's billing interval.
 *  - A mid-cycle quantity increase charges only the unused fraction of the
 *    current period; a decrease credits back only the unused fraction.
 *  - Cancellation refunds the unused fraction of the current prepaid period,
 *    subject to the plan's cancellation_policy JSON.
 *
 * Date math is calendar-based (interval months added to an anchor date) and
 * money arithmetic goes through shared/money.js so no float drift occurs.
 */

import { add, divide, multiply, subtract, compare, gt, lt } from '../../../shared/money.js';

const DAY_MS = 24 * 60 * 60 * 1000;
export const INTERVAL_MONTHS = { month: 1, quarter: 3, year: 12 };

/** Add `intervalUnit` calendar months to an ISO date (clamps month-end). */
export function addIntervalMonths(isoDate, intervalUnit) {
  const months = INTERVAL_MONTHS[intervalUnit];
  if (!months) throw new Error(`Unknown interval unit: ${intervalUnit}`);
  const d = new Date(isoDate);
  const day = d.getUTCDate();
  const targetIndex = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetIndex / 12);
  const month = targetIndex % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString();
}

/** Whole days between two ISO dates (>= 0). */
export function daysBetween(startIso, endIso) {
  const diff = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS);
  return diff >= 0 ? diff : 0;
}

/**
 * Find the billing period [start, end) containing `at`, anchored at
 * `anchorIso` (e.g. subscription started_at) with the given interval.
 */
export function periodContaining(anchorIso, intervalUnit, atIso) {
  const at = new Date(atIso).getTime();
  let start = new Date(anchorIso).getTime();
  if (at < start) throw new Error('effective date precedes the subscription anchor date');
  let end = new Date(addIntervalMonths(new Date(start).toISOString(), intervalUnit)).getTime();
  while (end <= at) {
    start = end;
    end = new Date(addIntervalMonths(new Date(start).toISOString(), intervalUnit)).getTime();
  }
  return { startIso: new Date(start).toISOString(), endIso: new Date(end).toISOString() };
}

/** Whole days of a period left unused after `at` (0 when at >= end). */
export function unusedDays({ startIso, endIso, atIso }) {
  const at = new Date(atIso).getTime();
  const end = new Date(endIso).getTime();
  if (at >= end) return 0;
  const start = new Date(startIso).getTime();
  if (at < start) return daysBetween(startIso, endIso);
  return daysBetween(atIso, endIso);
}

/**
 * Unused (refundable) portion of a full-period amount as of `atIso`.
 * `amount` is the FULL period amount; returns the unused share as a string.
 */
export function prorateUnusedAmount({ amount, startIso, endIso, atIso }) {
  const total = daysBetween(startIso, endIso);
  const unused = unusedDays({ startIso, endIso, atIso });
  if (total <= 0 || unused <= 0) return '0';
  return divide(multiply(amount, String(unused)), String(total));
}

/**
 * Signed prorated delta for a quantity change on a per-unit-per-period amount.
 * Positive deltaQuantity -> a charge; negative -> a credit.
 */
export function prorateQuantityDelta({ unitAmount, deltaQuantity, startIso, endIso, atIso }) {
  const total = daysBetween(startIso, endIso);
  const unused = unusedDays({ startIso, endIso, atIso });
  if (total <= 0 || unused <= 0) return '0';
  const negative = compare(deltaQuantity, '0') < 0;
  const absDelta = negative ? deltaQuantity.slice(1) : deltaQuantity;
  const fullDelta = multiply(unitAmount, absDelta);
  const prorated = divide(multiply(fullDelta, String(unused)), String(total));
  return negative ? subtract('0', prorated) : prorated;
}

/** Apply a plan's cancellation_policy JSON to a computed refund. */
export function applyCancellationPolicy({ policy, computedRefund, usedDaysValue, totalDays }) {
  const p = policy && typeof policy === 'object' ? policy : {};
  if (p.refund === 'none') return '0';
  const grace = Number(p.grace_days);
  if (Number.isFinite(grace) && grace > 0 && usedDaysValue <= grace) return computedRefund;
  return computedRefund;
}

export function isReduction(deltaQuantity) {
  return lt(deltaQuantity, '0');
}

export function isIncrease(deltaQuantity) {
  return gt(deltaQuantity, '0');
}

/** Exact per-unit-per-period price from a full-period amount at a quantity. */
export function unitPricePerPeriod({ scheduleAmount, previousQuantity }) {
  if (compare(previousQuantity, '0') <= 0) {
    throw new Error('Cannot derive unit price from a non-positive quantity.');
  }
  return divide(scheduleAmount, previousQuantity);
}

export function fullPeriodAmountAtQuantity({ scheduleAmount, previousQuantity, newQuantity }) {
  return multiply(unitPricePerPeriod({ scheduleAmount, previousQuantity }), newQuantity);
}
