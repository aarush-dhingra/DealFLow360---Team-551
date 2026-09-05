import test from 'node:test';
import assert from 'node:assert/strict';

import { reconcileInvoice, classifyLine, LINE_KINDS } from '../src/domains/finance/reconciliation/rules.js';

const invoice = {
  amountDue: '1500.0000',
  amountPaid: '500.0000',
  currencyCode: 'USD',
  status: 'partially_paid'
};

test('reconciliation: splits one-time and recurring totals separately', () => {
  const report = reconcileInvoice({
    invoice,
    lines: [
      { kind: 'one_time', amount: '1000.0000' },
      { kind: 'recurring', amount: '500.0000' },
      { kind: 'recurring', amount: '250.0000' }
    ],
    appliedCredits: '200.0000'
  });
  assert.equal(report.oneTime.count, 1);
  assert.equal(report.oneTime.total, '1000.0000');
  assert.equal(report.recurring.count, 2);
  assert.equal(report.recurring.total, '750.0000');
  assert.equal(report.originatedTotal, '1750.0000');
  assert.equal(report.amountDue, '1500.0000');
  assert.equal(report.outstanding, '1000.0000');
  assert.equal(report.netOwedAfterCredits, '800.0000');
});

test('reconciliation: empty lines yield zero totals', () => {
  const report = reconcileInvoice({
    invoice: { ...invoice, amountDue: '0', amountPaid: '0' },
    lines: [],
    appliedCredits: '0'
  });
  assert.equal(report.oneTime.total, '0');
  assert.equal(report.recurring.total, '0');
  assert.equal(report.netOwedAfterCredits, '0');
});

test('reconciliation: unknown line kind is rejected', () => {
  assert.throws(
    () => reconcileInvoice({ invoice, lines: [{ kind: 'tax', amount: '1' }] }),
    /Unknown line kind/
  );
});

test('reconciliation: classifyLine marks subscribed lines recurring', () => {
  const subscribed = new Set(['l2']);
  assert.equal(classifyLine({ lineId: 'l1', amount: '1', subscribedLineIds: subscribed }).kind, 'one_time');
  assert.equal(classifyLine({ lineId: 'l2', amount: '1', subscribedLineIds: subscribed }).kind, 'recurring');
});

test('reconciliation: fixed line kinds', () => {
  assert.deepEqual(LINE_KINDS, ['one_time', 'recurring']);
});
