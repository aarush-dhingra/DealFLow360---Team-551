/**
 * Fulfillment planning domain rules (pure, no I/O).
 *
 * Produces the recommended warehouse split for the physical lines of a quote's
 * current version:
 *  - Only one-time (physical) lines are considered; recurring subscription
 *    lines are excluded by the caller before planning.
 *  - Minimize shipment count first: when a single warehouse can cover the whole
 *    remaining quantity, prefer it; among full-cover candidates pick the
 *    cheapest by shipping_cost_weight.
 *  - Otherwise split cheapest-first across warehouses; never allocate more than
 *    a warehouse's available stock (on_hand - reserved).
 *  - What cannot be covered becomes a backorder allocation row (status
 *    'backordered'); a backorder reserves nothing.
 *
 * Quantities/weights are decimal strings; all math is exact via shared/money.
 */

import { subtract, add, compare, gt } from '../../../shared/money.js';

/** key `${warehouseId}|${productId}` */
function stockKey(warehouseId, productId) {
  return `${warehouseId}|${productId}`;
}

/**
 * Build warehouse availability map from inventory rows.
 * inventoryRows: [{ warehouseId, productId, quantityOnHand, quantityReserved }]
 */
export function buildAvailabilityMap(inventoryRows) {
  const map = new Map();
  for (const row of inventoryRows) {
    const key = stockKey(row.warehouseId, row.productId);
    const available = subtract(row.quantityOnHand, row.quantityReserved);
    map.set(key, compare(map.get(key) ?? '0', available) >= 0 ? map.get(key) : available);
  }
  return map;
}

function cheapestByWeight(warehouses) {
  return [...warehouses].sort((a, b) => {
    const byWeight = compare(a.shippingCostWeight, b.shippingCostWeight);
    if (byWeight !== 0) return byWeight;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Suggested warehouse split for physical lines.
 *
 * lines:       [{ quotationLineId, productId, quantity }]
 * inventory:   [{ warehouseId, productId, quantityOnHand, quantityReserved }]
 * warehouses:  [{ id, shippingCostWeight }]
 *
 * Returns { allocations, shipmentCount, shippingCostTotal } where allocations is
 * [{ quotationLineId, productId, warehouseId, quantity, status }] with status
 * 'allocated' or 'backordered'.
 */
export function suggestAllocations({ lines, inventory, warehouses }) {
  const availability = buildAvailabilityMap(inventory);
  const byCost = cheapestByWeight(warehouses);
  const allocations = [];

  for (const line of lines) {
    let remaining = line.quantity;

    // Candidate warehouses with any stock for this product.
    const candidates = byCost.filter((w) => {
      const avail = availability.get(stockKey(w.id, line.productId));
      return avail !== undefined && gt(avail, '0');
    });

    // 1. Prefer a single warehouse that fully covers (minimal shipment count).
    const fullCover = candidates.find((w) => {
      const avail = availability.get(stockKey(w.id, line.productId));
      return compare(avail, remaining) >= 0;
    });

    if (fullCover) {
      const avail = availability.get(stockKey(fullCover.id, line.productId));
      allocations.push({
        quotationLineId: line.quotationLineId,
        productId: line.productId,
        warehouseId: fullCover.id,
        quantity: remaining,
        status: 'allocated'
      });
      availability.set(stockKey(fullCover.id, line.productId), subtract(avail, remaining));
      continue;
    }

    // 2. Split cheapest-first across warehouses.
    for (const warehouse of candidates) {
      if (!gt(remaining, '0')) break;
      const avail = availability.get(stockKey(warehouse.id, line.productId));
      if (!gt(avail, '0')) continue;
      const take = compare(avail, remaining) >= 0 ? remaining : avail;
      allocations.push({
        quotationLineId: line.quotationLineId,
        productId: line.productId,
        warehouseId: warehouse.id,
        quantity: take,
        status: 'allocated'
      });
      availability.set(stockKey(warehouse.id, line.productId), subtract(avail, take));
      remaining = subtract(remaining, take);
    }

    // 3. Anything left becomes a backorder (cheapest warehouse as expected source).
    if (gt(remaining, '0')) {
      const fallback = cheapestByWeight(warehouses)[0];
      allocations.push({
        quotationLineId: line.quotationLineId,
        productId: line.productId,
        warehouseId: fallback?.id ?? null,
        quantity: remaining,
        status: 'backordered'
      });
    }
  }

  const { shipmentCount, shippingCostTotal } = computeShipmentStats(allocations, warehouses);
  return { allocations, shipmentCount, shippingCostTotal };
}

/**
 * Count shipments and total shipping cost from an allocation plan. Only
 * 'allocated' rows count as shipments; backorders ship later.
 */
export function computeShipmentStats(allocations, warehouses) {
  const weightById = new Map(warehouses.map((w) => [w.id, w.shippingCostWeight]));
  const used = new Set(
    allocations.filter((a) => a.status === 'allocated').map((a) => a.warehouseId)
  );
  let total = '0';
  for (const id of used) {
    const weight = weightById.get(id);
    if (weight !== undefined) total = add(total, weight);
  }
  return { shipmentCount: used.size, shippingCostTotal: total };
}

/**
 * Quote statuses that permit starting fulfillment allocation.
 */
export const FULFILLABLE_QUOTE_STATUSES = new Set([
  'approved',
  'customer_confirmed',
  'confirmed'
]);

export function canAllocate(status) {
  return FULFILLABLE_QUOTE_STATUSES.has(status);
}
