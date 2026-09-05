import test from 'node:test';
import assert from 'node:assert/strict';

import {
  outstandingBalance,
  validatePayment,
  canVoidInvoice,
  PAYABLE_STATUSES
} from '../src/domains/finance/payments/rules.js';

const invoice = {
  amountDue: '1000.0000',
  amountPaid: '0',
  status: 'issued',
  appliedCredits: '0'
};

test('payments: full payment flips invoice to paid', () => {
  const r = validatePayment({ invoice, amount: '1000.0000' });
  assert.equal(r.statusAfter, 'paid');
  assert.equal(r.amountPaidAfter, '1000.0000');
});

test('payments: partial payment flips to partially_paid', () => {
  const r = validatePayment({ invoice, amount: '400.0000' });
  assert.equal(r.statusAfter, 'partially_paid');
});

test('payments: overpaying is rejected', () => {
  assert.throws(
    () => validatePayment({ invoice, amount: '1000.0001' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('payments: payment cannot land on terminal invoices', () => {
  for (const status of ['paid', 'credited', 'void']) {
    assert.throws(
      () => validatePayment({ invoice: { ...invoice, status }, amount: '1.0000' }),
      (err) => err.code === 'INVALID_TRANSITION'
    );
  }
});

test('payments: outstanding subtracts paid and applied credits', () => {
  assert.equal(
    outstandingBalance({ amountDue: '1000', amountPaid: '300', appliedCredits: '200' }),
    '500.0000'
  );
});

test('payments: outstanding never goes below zero', () => {
  assert.equal(
    outstandingBalance({ amountDue: '100', amountPaid: '80', appliedCredits: '90' }),
    '0'
  );
});

test('payments: void only when nothing paid and nothing credited', () => {
  assert.equal(canVoidInvoice(invoice), true);
  assert.equal(canVoidInvoice({ ...invoice, amountPaid: '1' }), false);
  assert.equal(canVoidInvoice({ ...invoice, appliedCredits: '1' }), false);
  assert.equal(canVoidInvoice({ ...invoice, status: 'paid' }), false);
});

test('payments: payable statuses are the open set', () => {
  assert.deepEqual([...PAYABLE_STATUSES].sort(), ['issued', 'overdue', 'partially_paid']);
});
