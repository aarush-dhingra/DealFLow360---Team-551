import test from 'node:test';
import assert from 'node:assert/strict';

import { allocateFulfillment, consolidateBackorders, previewFulfillmentPlan } from '../src/domains/finance/fulfillment/service.js';
import { allocateBody, allocateParams, applyPaymentBody, issueCreditNoteBody } from '../src/interfaces/http/finance/schemas.js';

const principal = { userId: 'u-fin', roles: ['finance_operations'] };

test('service seams: allocation validates mode before touching the DB', async () => {
  const err = await allocateFulfillment({
    quotationId: 'q-1',
    mode: 'sideways',
    principal
  }).catch((e) => e);
  assert.equal(err?.code, 'VALIDATION_ERROR');
});

test('service seams: manual mode requires allocations', async () => {
  const err = await allocateFulfillment({
    quotationId: 'q-1',
    mode: 'manual',
    principal
  }).catch((e) => e);
  assert.equal(err?.code, 'VALIDATION_ERROR');
});

test('service seams: consolidation requires a quotation id', async () => {
  const err = await consolidateBackorders({ principal }).catch((e) => e);
  assert.equal(err?.code, 'VALIDATION_ERROR');
});

test('service seams: preview requires a quotation id', async () => {
  const err = await previewFulfillmentPlan({}).catch((e) => e);
  assert.equal(err?.code, 'VALIDATION_ERROR');
});

test('schemas: allocation params require a UUID quotation id', () => {
  assert.equal(allocateParams.safeParse({ quotationId: 'nope' }).success, false);
  assert.equal(
    allocateParams.safeParse({ quotationId: '11111111-1111-4111-8111-111111111111' }).success,
    true
  );
});

test('schemas: suggested mode must not carry allocations', () => {
  const parsed = allocateBody.safeParse({
    mode: 'suggested',
    allocations: [{ quotationLineId: 'l', warehouseId: 'w', quantity: '1' }]
  });
  assert.equal(parsed.success, false);
});

test('schemas: manual mode carries a quantity string', () => {
  const parsed = allocateBody.safeParse({
    mode: 'manual',
    allocations: [
      {
        quotationLineId: '11111111-1111-4111-8111-111111111111',
        warehouseId: '22222222-2222-4222-8222-222222222222',
        quantity: '3.5000'
      }
    ]
  });
  assert.equal(parsed.success, true);
});

test('schemas: payment body rejects zero amount and missing method', () => {
  assert.equal(applyPaymentBody.safeParse({ amount: '0', method: 'card' }).success, false);
  assert.equal(applyPaymentBody.safeParse({ amount: '10', method: '' }).success, false);
  assert.equal(applyPaymentBody.safeParse({ amount: '10', method: 'card' }).success, true);
});

test('schemas: credit note body requires reason and positive amount', () => {
  assert.equal(issueCreditNoteBody.safeParse({ amount: '5' }).success, false);
  assert.equal(issueCreditNoteBody.safeParse({ amount: '5', reason: 'overcharge' }).success, true);
});
