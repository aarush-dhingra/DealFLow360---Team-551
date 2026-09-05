import test from 'node:test';
import assert from 'node:assert/strict';

import {
  suggestAllocations,
  buildAvailabilityMap,
  computeShipmentStats,
  canAllocate
} from '../src/domains/finance/fulfillment/planning.js';
import { validateManualAllocation } from '../src/domains/finance/fulfillment/allocation.js';

const warehouses = [
  { id: 'wh-main', shippingCostWeight: '10' },
  { id: 'wh-east', shippingCostWeight: '20' }
];

test('fulfillment: single full-cover warehouse minimizes shipment count', () => {
  const plan = suggestAllocations({
    lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '8' }],
    inventory: [
      { warehouseId: 'wh-main', productId: 'p1', quantityOnHand: '5', quantityReserved: '0' },
      { warehouseId: 'wh-east', productId: 'p1', quantityOnHand: '10', quantityReserved: '0' }
    ],
    warehouses
  });
  assert.equal(plan.shipmentCount, 1);
  assert.equal(plan.allocations.length, 1);
  assert.equal(plan.allocations[0].warehouseId, 'wh-east'); // full cover wins
  assert.equal(plan.shippingCostTotal, '20.0000');
});

test('fulfillment: split cheapest-first when no single warehouse covers', () => {
  const plan = suggestAllocations({
    lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '8' }],
    inventory: [
      { warehouseId: 'wh-main', productId: 'p1', quantityOnHand: '5', quantityReserved: '0' },
      { warehouseId: 'wh-east', productId: 'p1', quantityOnHand: '5', quantityReserved: '0' }
    ],
    warehouses
  });
  assert.equal(plan.shipmentCount, 2);
  const [a, b] = plan.allocations;
  assert.equal(a.warehouseId, 'wh-main');
  assert.equal(a.quantity, '5.0000');
  assert.equal(b.warehouseId, 'wh-east');
  assert.equal(b.quantity, '3.0000');
  assert.equal(plan.shippingCostTotal, '30.0000');
});

test('fulfillment: shortfall becomes a backorder that reserves nothing', () => {
  const plan = suggestAllocations({
    lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '12' }],
    inventory: [
      { warehouseId: 'wh-main', productId: 'p1', quantityOnHand: '5', quantityReserved: '0' }
    ],
    warehouses
  });
  const allocated = plan.allocations.filter((a) => a.status === 'allocated');
  const backorders = plan.allocations.filter((a) => a.status === 'backordered');
  assert.equal(allocated.length, 1);
  assert.equal(allocated[0].quantity, '5.0000');
  assert.equal(backorders.length, 1);
  assert.equal(backorders[0].quantity, '7.0000');
  assert.ok(backorders[0].warehouseId); // NOT NULL warehouse invariant
});

test('fulfillment: never exceeds on_hand minus reserved', () => {
  const plan = suggestAllocations({
    lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '20' }],
    inventory: [
      { warehouseId: 'wh-main', productId: 'p1', quantityOnHand: '6', quantityReserved: '2' }
    ],
    warehouses
  });
  const allocated = plan.allocations.filter((a) => a.status === 'allocated');
  assert.equal(allocated.reduce((s, a) => s + Number(a.quantity), 0), 4);
});

test('fulfillment: buildAvailabilityMap subtracts reservations', () => {
  const map = buildAvailabilityMap([
    { warehouseId: 'wh-main', productId: 'p1', quantityOnHand: '10', quantityReserved: '3' }
  ]);
  assert.equal(map.get('wh-main|p1'), '7.0000');
});

test('fulfillment: computeShipmentStats counts distinct warehouses once', () => {
  const stats = computeShipmentStats(
    [
      { warehouseId: 'wh-main', status: 'allocated' },
      { warehouseId: 'wh-main', status: 'allocated' },
      { warehouseId: 'wh-east', status: 'backordered' }
    ],
    warehouses
  );
  assert.equal(stats.shipmentCount, 1);
  assert.equal(stats.shippingCostTotal, '10.0000');
});

test('fulfillment: manual allocation beyond line quantity is rejected', () => {
  assert.throws(
    () =>
      validateManualAllocation({
        lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '10' }],
        requested: [{ quotationLineId: 'l1', warehouseId: 'wh-main', quantity: '12' }],
        availabilityMap: new Map([['wh-main|p1', '20']]),
        warehouses,
        inventory: []
      }),
    (err) => err.code === 'OVER_ALLOCATION'
  );
});

test('fulfillment: manual allocation beyond available stock is rejected', () => {
  assert.throws(
    () =>
      validateManualAllocation({
        lines: [{ quotationLineId: 'l1', productId: 'p1', quantity: '10' }],
        requested: [{ quotationLineId: 'l1', warehouseId: 'wh-main', quantity: '8' }],
        availabilityMap: new Map([['wh-main|p1', '5']]),
        warehouses,
        inventory: []
      }),
    (err) => err.code === 'INSUFFICIENT_STOCK'
  );
});

test('fulfillment: canAllocate only for post-approval states', () => {
  assert.equal(canAllocate('approved'), true);
  assert.equal(canAllocate('customer_confirmed'), true);
  assert.equal(canAllocate('confirmed'), true);
  assert.equal(canAllocate('draft'), false);
  assert.equal(canAllocate('paid'), false);
});
