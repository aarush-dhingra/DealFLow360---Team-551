/**
 * Fulfillment planning domain rules (pure, no I/O).
 *
 * Produces the recommended warehouse split for the physical lines of a quote's
 * current version:
 *  - Only one-time (physical) lines are considered; recurring subscription
 *    lines are excluded by the caller before planning.
 *  - Minimize the total warehouse shipment charge first. Fewer shipments are a
 *    tie-breaker, never a reason to charge the customer more.
 *  - Otherwise split lowest incremental-cost first; never allocate more than
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
 * Pick the expected source warehouse for a backorder: the cheapest active
 * warehouse that stocks the product (even at zero on-hand), falling back to the
 * cheapest active warehouse overall. Keeps the NOT NULL warehouse_id invariant
 * while persisting backorders as allocations with status 'backordered'.
 */
export function pickBackorderWarehouse(productId, warehouses, inventory) {
  const byCost = cheapestByWeight(warehouses);
  const stocked = new Set(
    inventory.filter((row) => row.productId === productId).map((row) => row.warehouseId)
  );
  return byCost.find((w) => stocked.has(w.id))?.id ?? byCost[0]?.id ?? null;
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

function requiredByProduct(lines) {
  const required = new Map();
  for (const line of lines) required.set(line.productId, add(required.get(line.productId) ?? '0', line.quantity));
  return required;
}

/**
 * For the small operational warehouse set, evaluate every usable warehouse
 * combination. This prevents a greedy first line from selecting a cheap
 * warehouse that later forces a more expensive second shipment.
 */
function lowestCostFullCoverageSet(lines, availability, warehouses) {
  if (warehouses.length > 15) return null;
  const required = requiredByProduct(lines);
  let best = null;
  for (let mask = 1; mask < (1 << warehouses.length); mask += 1) {
    const selected = warehouses.filter((_, index) => mask & (1 << index));
    const covers = [...required].every(([productId, needed]) => {
      let available = '0';
      for (const warehouse of selected) available = add(available, availability.get(stockKey(warehouse.id, productId)) ?? '0');
      return compare(available, needed) >= 0;
    });
    if (!covers) continue;
    const cost = selected.reduce((total, warehouse) => add(total, warehouse.shippingCostWeight), '0');
    if (!best || compare(cost, best.cost) < 0 || (compare(cost, best.cost) === 0 && selected.length < best.warehouses.length)) {
      best = { warehouses: selected, cost };
    }
  }
  return best;
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
  const fullyCoveringSet = lowestCostFullCoverageSet(lines, availability, byCost);
  const selectedWarehouseIds = new Set();

  for (const line of lines) {
    let remaining = line.quantity;

    // Candidate warehouses with any stock for this product.
    const candidates = (fullyCoveringSet?.warehouses ?? byCost).filter((w) => {
      const avail = availability.get(stockKey(w.id, line.productId));
      return avail !== undefined && gt(avail, '0');
    }).sort((a, b) => {
      const existingA = selectedWarehouseIds.has(a.id) ? 0 : 1;
      const existingB = selectedWarehouseIds.has(b.id) ? 0 : 1;
      if (existingA !== existingB) return existingA - existingB;
      return compare(a.shippingCostWeight, b.shippingCostWeight);
    });

    // Allocate from the selected lowest-cost warehouse set. When full coverage
    // is impossible, avoid opening an extra warehouse unless it reduces cost.
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
      selectedWarehouseIds.add(warehouse.id);
      remaining = subtract(remaining, take);
    }

    // Anything left becomes a backorder (cheapest stocking warehouse as the
    // expected source; backorder reserves nothing).
    if (gt(remaining, '0')) {
      allocations.push({
        quotationLineId: line.quotationLineId,
        productId: line.productId,
        warehouseId: pickBackorderWarehouse(line.productId, warehouses, inventory),
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
