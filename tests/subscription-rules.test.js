import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addIntervalMonths,
  daysBetween,
  periodContaining,
  unusedDays,
  prorateUnusedAmount,
  prorateQuantityDelta,
  unitPricePerPeriod,
  fullPeriodAmountAtQuantity
} from '../src/domains/finance/subscriptions/proration.js';
import {
  canCancel,
  canChangeQuantity,
  computeCancellationRefund
} from '../src/domains/finance/subscriptions/rules.js';

test('proration: addIntervalMonths advances calendar months and clamps month-end', () => {
  assert.equal(addIntervalMonths('2025-01-15T00:00:00.000Z', 'month'), '2025-02-15T00:00:00.000Z');
  assert.equal(addIntervalMonths('2025-01-15T00:00:00.000Z', 'quarter'), '2025-04-15T00:00:00.000Z');
  assert.equal(addIntervalMonths('2025-01-31T00:00:00.000Z', 'month'), '2025-02-28T00:00:00.000Z');
  assert.equal(addIntervalMonths('2024-11-30T00:00:00.000Z', 'year'), '2025-11-30T00:00:00.000Z');
});

test('proration: daysBetween is whole days, never negative', () => {
  assert.equal(daysBetween('2025-01-01T00:00:00.000Z', '2025-01-08T00:00:00.000Z'), 7);
});

test('proration: periodContaining locates the current interval', () => {
  const { startIso, endIso } = periodContaining(
    '2025-01-01T00:00:00.000Z',
    'month',
    '2025-01-25T00:00:00.000Z'
  );
  assert.equal(startIso, '2025-01-01T00:00:00.000Z');
  assert.equal(endIso, '2025-02-01T00:00:00.000Z');
});

test('proration: unusedDays counts the days left after the effective date', () => {
  const span = {
    startIso: '2025-01-01T00:00:00.000Z',
    endIso: '2025-02-01T00:00:00.000Z'
  };
  assert.equal(unusedDays({ ...span, atIso: '2025-01-25T00:00:00.000Z' }), 7);
  assert.equal(unusedDays({ ...span, atIso: '2025-01-01T00:00:00.000Z' }), 31);
  assert.equal(unusedDays({ ...span, atIso: '2025-02-01T00:00:00.000Z' }), 0);
});

test('proration: prorateUnusedAmount returns the unused share exactly', () => {
  const refund = prorateUnusedAmount({
    amount: '31.0000',
    startIso: '2025-01-01T00:00:00.000Z',
    endIso: '2025-02-01T00:00:00.000Z',
    atIso: '2025-01-25T00:00:00.000Z'
  });
  assert.equal(refund, '7.0000'); // 31 * 7 / 31
});

test('proration: quantity delta charges on increase, credits on decrease', () => {
  const span = {
    startIso: '2025-01-01T00:00:00.000Z',
    endIso: '2025-02-01T00:00:00.000Z',
    atIso: '2025-01-25T00:00:00.000Z' // 7 unused days of 31
  };
  const charge = prorateQuantityDelta({ unitAmount: '10.0000', deltaQuantity: '2', ...span });
  assert.equal(charge, '4.5161'); // 2 * 10 * 7/31 rounded to 4dp
  const credit = prorateQuantityDelta({ unitAmount: '10.0000', deltaQuantity: '-2', ...span });
  assert.equal(credit, '-4.5161');
});

test('subscription rules: cancel/change gates by status', () => {
  assert.equal(canCancel('active'), true);
  assert.equal(canCancel('paused'), true);
  assert.equal(canCancel('cancelled'), false);
  assert.equal(canCancel('expired'), false);
  assert.equal(canChangeQuantity('active'), true);
  assert.equal(canChangeQuantity('pending'), false);
});

test('subscription rules: cancellation refund prorates the prepaid period', () => {
  const refund = computeCancellationRefund({
    anchorIso: '2025-01-01T00:00:00.000Z',
    intervalUnit: 'month',
    atIso: '2025-01-25T00:00:00.000Z',
    prepaidAmount: '31.0000',
    cancellationPolicy: {}
  });
  assert.equal(refund, '7.0000');
});

test('subscription rules: refund none policy suppresses the refund', () => {
  const refund = computeCancellationRefund({
    anchorIso: '2025-01-01T00:00:00.000Z',
    intervalUnit: 'month',
    atIso: '2025-01-25T00:00:00.000Z',
    prepaidAmount: '31.0000',
    cancellationPolicy: { refund: 'none' }
  });
  assert.equal(refund, '0');
});

test('subscription rules: nothing prepaid means no refund', () => {
  const refund = computeCancellationRefund({
    anchorIso: '2025-01-01T00:00:00.000Z',
    intervalUnit: 'month',
    atIso: '2025-01-10T00:00:00.000Z',
    prepaidAmount: '0',
    cancellationPolicy: {}
  });
  assert.equal(refund, '0');
});

test('proration: unit price and next full period amount are consistent', () => {
  assert.equal(unitPricePerPeriod({ scheduleAmount: '120.0000', previousQuantity: '4' }), '30.0000');
  assert.equal(
    fullPeriodAmountAtQuantity({ scheduleAmount: '120.0000', previousQuantity: '4', newQuantity: '6' }),
    '180.0000'
  );
});
