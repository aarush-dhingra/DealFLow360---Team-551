import test from 'node:test';
import assert from 'node:assert/strict';

import {
  outstandingBalance,
  validateCreditNoteIssue,
  validateCreditNoteApply,
  invoiceStatusAfterCredit,
  canTransitionCreditNote
} from '../src/domains/finance/credit-notes/rules.js';

const invoice = {
  amountDue: '1000.0000',
  amountPaid: '0',
  status: 'issued',
  appliedCredits: '0'
};

test('credit notes: issue within outstanding balance is allowed', () => {
  assert.equal(validateCreditNoteIssue({ invoice, amount: '400.0000' }), '400.0000');
});

test('credit notes: issue beyond the balance is rejected', () => {
  assert.throws(
    () => validateCreditNoteIssue({ invoice, amount: '1000.0001' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('credit notes: apply beyond still-owed is rejected', () => {
  const partial = { ...invoice, amountPaid: '700.0000' };
  assert.throws(
    () => validateCreditNoteApply({ invoice: partial, amount: '400.0000', alreadyApplied: '0' }),
    (err) => err.code === 'VALIDATION_ERROR'
  );
});

test('credit notes: apply that covers the balance marks invoice credited', () => {
  const partial = { ...invoice, amountPaid: '700.0000' };
  const total = validateCreditNoteApply({ invoice: partial, amount: '300.0000', alreadyApplied: '0' });
  assert.equal(total, '300.0000');
  assert.equal(invoiceStatusAfterCredit({ invoice: partial, appliedCreditsTotal: total }), 'credited');
});

test('credit notes: partial apply keeps the invoice open', () => {
  const partial = { ...invoice, amountPaid: '200.0000' };
  const total = validateCreditNoteApply({ invoice: partial, amount: '100.0000', alreadyApplied: '0' });
  assert.equal(invoiceStatusAfterCredit({ invoice: partial, appliedCreditsTotal: total }), 'issued');
});

test('credit notes: outstanding subtracts paid and applied credits', () => {
  assert.equal(
    outstandingBalance({ amountDue: '1000', amountPaid: '400', appliedCredits: '100' }),
    '500.0000'
  );
});

test('credit notes: lifecycle transitions are guarded', () => {
  assert.equal(canTransitionCreditNote('issued', 'applied'), true);
  assert.equal(canTransitionCreditNote('issued', 'void'), true);
  assert.equal(canTransitionCreditNote('applied', 'void'), false);
  assert.equal(canTransitionCreditNote('void', 'issued'), false);
});
