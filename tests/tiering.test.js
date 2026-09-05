import test from 'node:test';
import assert from 'node:assert/strict';
import { highestEligibleTier } from '../src/domains/customers/tiering.service.js';

const tiers = [
  { code: 'bronze', qualification_spend: '10000', qualification_order_count: 3 },
  { code: 'silver', qualification_spend: '50000', qualification_order_count: 10 },
  { code: 'gold', qualification_spend: '150000', qualification_order_count: 25 },
];

test('tiering: new customers remain without a tier until a milestone is met', () => {
  assert.equal(highestEligibleTier(tiers, { netSpend: '0', completedOrders: 0 }), null);
});

test('tiering: either paid spend or completed-order milestone earns the highest tier', () => {
  assert.equal(highestEligibleTier(tiers, { netSpend: '52000', completedOrders: 1 }).code, 'silver');
  assert.equal(highestEligibleTier(tiers, { netSpend: '1', completedOrders: 25 }).code, 'gold');
});
