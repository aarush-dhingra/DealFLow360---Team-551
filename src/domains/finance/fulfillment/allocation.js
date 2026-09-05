/**
 * Allocation domain rules (pure, no I/O).
 *
 * Finance/Operations owns accepting the suggested split and manual overrides.
 * Manager may only view; Admin only configures warehouses/inventory — enforced
 * at the HTTP layer.
 *
 * Rules:
 *  - A suggested plan comes from fulfillment planning (minimize shipments).
 *  - A manual override must (a) stay within each line's ordered quantity and
 *    (b) never exceed the currently available stock per warehouse+product.
 *  - The caller supplies the availability map AFTER releasing the order's old
 *    reservations (override) or from live inventory (fresh allocation), so the
 *    domain never double-books stock.
 */

import { compare, add, subtract, gt, lt } from '../../../shared/money.js';
import { Errors } from '../../../shared/errors.js';
import { computeShipmentStats, pickBackorderWarehouse } from './planning.js';

function stockKey(warehouseId, productId) {
  return `${warehouseId}|${productId}`;
}

/**
 * Validate and normalize a manual allocation request.
 *
 * lines:           [{ quotationLineId, productId, quantity }]
 * requested:       [{ quotationLineId, warehouseId, quantity }]
 * availabilityMap: Map `${warehouseId}|${productId}` -> available qty
 * warehouses:      [{ id, shippingCostWeight }]
 * inventory:       [{ warehouseId, productId, ... }] used to pick the expected
 *                  backorder warehouse.
 *
 * Returns { allocations, shipmentCount, shippingCostTotal }; backorders are
 * created for any line quantity not covered by the manual allocation.
 */
export function validateManualAllocation({ lines, requested, availabilityMap, warehouses, inventory }) {
  const byLine = new Map(lines.map((l) => [l.quotationLineId, l]));

  // Per-line and per-stock totals requested.
  const requestedPerLine = new Map();
  const requestedPerStock = new Map();

  for (const row of requested) {
    const line = byLine.get(row.quotationLineId);
    if (!line) throw Errors.validation('Manual allocation references an unknown line.');
    const key = stockKey(row.warehouseId, line.productId);

    requestedPerLine.set(row.quotationLineId, add(requestedPerLine.get(row.quotationLineId) ?? '0', row.quantity));
    requestedPerStock.set(key, add(requestedPerStock.get(key) ?? '0', row.quantity));
  }

  for (const [lineId, total] of requestedPerLine) {
    if (gt(total, byLine.get(lineId).quantity)) {
      throw Errors.overAllocation();
    }
  }
  for (const [key, total] of requestedPerStock) {
    const available = availabilityMap.get(key);
    if (available === undefined || lt(available, total)) {
      throw Errors.insufficientStock();
    }
  }

  // Build the normalized allocation rows.
  const allocations = [];
  for (const row of requested) {
    const line = byLine.get(row.quotationLineId);
    allocations.push({
      quotationLineId: row.quotationLineId,
      productId: line.productId,
      warehouseId: row.warehouseId,
      quantity: row.quantity,
      status: 'allocated'
    });
    const key = stockKey(row.warehouseId, line.productId);
    availabilityMap.set(key, subtract(availabilityMap.get(key), row.quantity));
  }

  // Any unallocated remainder of a line becomes a backorder.
  for (const line of lines) {
    const covered = requestedPerLine.get(line.quotationLineId) ?? '0';
    if (lt(covered, line.quantity)) {
      allocations.push({
        quotationLineId: line.quotationLineId,
        productId: line.productId,
        warehouseId: pickBackorderWarehouse(line.productId, warehouses, inventory ?? []),
        quantity: subtract(line.quantity, covered),
        status: 'backordered'
      });
    }
  }

  const { shipmentCount, shippingCostTotal } = computeShipmentStats(allocations, warehouses);
  return { allocations, shipmentCount, shippingCostTotal };
}

/** Whether an allocation row is a live (non-cancelled) backorder. */
export function isBackorder(allocation) {
  return allocation.status === 'backordered' && compare(allocation.quantity, '0') > 0;
}
