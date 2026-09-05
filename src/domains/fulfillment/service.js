import Decimal from 'decimal.js';
import { pool } from '../../infrastructure/database/pool.js';
import { inTransaction, writeAuditAndOutbox } from '../../infrastructure/database/transaction.js';
import { AppError } from '../../shared/http.js';

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP });
const d = (value) => new Decimal(value ?? 0);
const quantity = (value) => d(value).toDecimalPlaces(4).toFixed(4);
const fulfillmentEligibleStatuses = new Set(['approved', 'customer_confirmed', 'confirmed']);

function inventoryKey(warehouseId, productId) {
  return `${warehouseId}:${productId}`;
}

async function loadContext(client, quoteId, lockInventory = false) {
  const quoteResult = await client.query(
    `SELECT q.id, q.quote_number, q.status, q.current_version_number, qv.id AS quotation_version_id
     FROM quotations q
     JOIN quotation_versions qv ON qv.quotation_id = q.id AND qv.version_number = q.current_version_number
     WHERE q.id = $1`,
    [quoteId]
  );
  const quote = quoteResult.rows[0];
  if (!quote) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Quotation was not found.');
  if (!fulfillmentEligibleStatuses.has(quote.status)) {
    throw new AppError(409, 'QUOTE_NOT_READY_FOR_FULFILLMENT', 'Only approved or confirmed quotations can be planned for fulfillment.');
  }

  const { rows: lines } = await client.query(
    `SELECT ql.id, ql.line_number, ql.product_id, ql.quantity, ql.description, p.billing_kind
     FROM quotation_lines ql
     JOIN products p ON p.id = ql.product_id
     WHERE ql.quotation_version_id = $1
     ORDER BY ql.line_number`,
    [quote.quotation_version_id]
  );
  const fulfillableLines = lines.filter((line) => line.billing_kind === 'one_time');
  const { rows: warehouses } = await client.query(
    `SELECT id, code, name, shipping_cost_weight
     FROM warehouses WHERE is_active ORDER BY shipping_cost_weight ASC, code ASC`
  );
  const productIds = fulfillableLines.map((line) => line.product_id);
  const inventorySql = `SELECT il.warehouse_id, il.product_id, il.quantity_on_hand, il.quantity_reserved
    FROM inventory_levels il
    JOIN warehouses w ON w.id = il.warehouse_id
    WHERE w.is_active AND il.product_id = ANY($1::uuid[])${lockInventory ? ' FOR UPDATE OF il' : ''}`;
  const { rows: inventory } = productIds.length
    ? await client.query(inventorySql, [productIds])
    : { rows: [] };
  return { quote, lines: fulfillableLines, warehouses, inventory };
}

function candidateWarehouses(context) {
  const available = new Map();
  for (const item of context.inventory) {
    available.set(inventoryKey(item.warehouse_id, item.product_id), Decimal.max(0, d(item.quantity_on_hand).minus(item.quantity_reserved)));
  }
  return { available, warehouses: context.warehouses.filter((warehouse) => context.inventory.some((item) => item.warehouse_id === warehouse.id && d(item.quantity_on_hand).gt(item.quantity_reserved))) };
}

function coversAll(lines, warehouseIds, available) {
  return lines.every((line) => warehouseIds.reduce(
    (sum, warehouseId) => sum.plus(available.get(inventoryKey(warehouseId, line.product_id)) ?? 0),
    d(0)
  ).gte(line.quantity));
}

function chooseWarehouses(lines, warehouses, available) {
  if (!lines.length) return [];
  const ordered = [...warehouses].sort((a, b) => d(a.shipping_cost_weight).cmp(d(b.shipping_cost_weight)) || a.code.localeCompare(b.code));
  let best = null;
  // Exhaustive selection gives the intended priority: fewest shipments, then lowest configured cost.
  // For unusually large warehouse sets, use all stocked warehouses rather than performing an unsafe exponential search.
  if (ordered.length <= 15) {
    for (let mask = 1; mask < (1 << ordered.length); mask += 1) {
      const selected = ordered.filter((_warehouse, index) => (mask & (1 << index)) !== 0);
      if (!coversAll(lines, selected.map((warehouse) => warehouse.id), available)) continue;
      const cost = selected.reduce((sum, warehouse) => sum.plus(warehouse.shipping_cost_weight), d(0));
      if (!best || selected.length < best.selected.length || (selected.length === best.selected.length && cost.lt(best.cost))) {
        best = { selected, cost };
      }
    }
  }
  return best?.selected ?? ordered;
}

function buildAutomaticPlan(context) {
  const { available, warehouses } = candidateWarehouses(context);
  const selected = chooseWarehouses(context.lines, warehouses, available);
  const selectedIds = selected.map((warehouse) => warehouse.id);
  const allocations = [];
  const backorders = [];
  const usedWarehouses = new Set();

  for (const line of context.lines) {
    let remaining = d(line.quantity);
    for (const warehouse of selected) {
      if (remaining.lte(0)) break;
      const key = inventoryKey(warehouse.id, line.product_id);
      const assignable = Decimal.min(remaining, available.get(key) ?? 0);
      if (assignable.lte(0)) continue;
      allocations.push({ quotationLineId: line.id, warehouseId: warehouse.id, quantity: quantity(assignable) });
      available.set(key, (available.get(key) ?? d(0)).minus(assignable));
      remaining = remaining.minus(assignable);
      usedWarehouses.add(warehouse.id);
    }
    if (remaining.gt(0)) {
      const preferredWarehouse = selected.find((warehouse) => (available.get(inventoryKey(warehouse.id, line.product_id)) ?? d(0)).gt(0))
        ?? context.warehouses.find((warehouse) => context.inventory.some((item) => item.warehouse_id === warehouse.id && item.product_id === line.product_id));
      backorders.push({ quotationLineId: line.id, quantity: quantity(remaining), preferredWarehouseId: preferredWarehouse?.id ?? null });
    }
  }
  const shipmentCost = [...usedWarehouses].reduce((sum, warehouseId) => sum.plus(context.warehouses.find((warehouse) => warehouse.id === warehouseId)?.shipping_cost_weight ?? 0), d(0));
  return { allocations, backorders, shipmentCount: usedWarehouses.size, estimatedShipmentCost: quantity(shipmentCost), selectedWarehouseIds: selectedIds };
}

function buildManualPlan(context, requestedAllocations) {
  const { available } = candidateWarehouses(context);
  const lines = new Map(context.lines.map((line) => [line.id, line]));
  const activeWarehouses = new Set(context.warehouses.map((warehouse) => warehouse.id));
  const allocatedByLine = new Map();
  const allocationsByInventory = new Map();
  const allocations = [];
  const usedWarehouses = new Set();

  for (const requested of requestedAllocations) {
    const line = lines.get(requested.quotationLineId);
    if (!line) throw new AppError(422, 'INVALID_FULFILLMENT_LINE', 'Manual allocation must reference a one-time line on the active quotation version.');
    if (!activeWarehouses.has(requested.warehouseId)) throw new AppError(422, 'INVALID_WAREHOUSE', 'Manual allocation must reference an active warehouse.');
    const allocationQuantity = d(requested.quantity);
    const inventoryId = inventoryKey(requested.warehouseId, line.product_id);
    const nextReserved = (allocationsByInventory.get(inventoryId) ?? d(0)).plus(allocationQuantity);
    if (nextReserved.gt(available.get(inventoryId) ?? 0)) throw new AppError(409, 'INSUFFICIENT_STOCK', 'Manual allocation exceeds currently available stock.');
    const nextLineQuantity = (allocatedByLine.get(line.id) ?? d(0)).plus(allocationQuantity);
    if (nextLineQuantity.gt(line.quantity)) throw new AppError(422, 'OVER_ALLOCATED_LINE', 'Manual allocation exceeds the quotation line quantity.');
    allocationsByInventory.set(inventoryId, nextReserved);
    allocatedByLine.set(line.id, nextLineQuantity);
    allocations.push({ quotationLineId: line.id, warehouseId: requested.warehouseId, quantity: quantity(allocationQuantity) });
    usedWarehouses.add(requested.warehouseId);
  }

  const backorders = context.lines.flatMap((line) => {
    const remainder = d(line.quantity).minus(allocatedByLine.get(line.id) ?? 0);
    return remainder.gt(0) ? [{ quotationLineId: line.id, quantity: quantity(remainder), preferredWarehouseId: null }] : [];
  });
  const shipmentCost = [...usedWarehouses].reduce((sum, warehouseId) => sum.plus(context.warehouses.find((warehouse) => warehouse.id === warehouseId)?.shipping_cost_weight ?? 0), d(0));
  return { allocations, backorders, shipmentCount: usedWarehouses.size, estimatedShipmentCost: quantity(shipmentCost), selectedWarehouseIds: [...usedWarehouses] };
}

export async function previewFulfillment(quoteId) {
  const context = await loadContext(pool, quoteId);
  const plan = buildAutomaticPlan(context);
  return { quoteId, quoteNumber: context.quote.quote_number, recurringLinesExcluded: true, ...plan };
}

async function persistPlan(quoteId, actorUserId, allocationMode, planFactory) {
  return inTransaction(async (client) => {
    const quoteLock = await client.query('SELECT id FROM quotations WHERE id = $1 FOR UPDATE', [quoteId]);
    if (!quoteLock.rows[0]) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Quotation was not found.');
    const existing = await client.query(`SELECT id FROM fulfillment_orders WHERE quotation_id = $1 AND status <> 'cancelled'`, [quoteId]);
    if (existing.rows[0]) throw new AppError(409, 'FULFILLMENT_ALREADY_EXISTS', 'This quotation already has an active fulfillment order.');
    const context = await loadContext(client, quoteId, true);
    const plan = planFactory(context);
    const { rows: orders } = await client.query(
      `INSERT INTO fulfillment_orders (quotation_id, status, allocation_mode)
       VALUES ($1, $2, $3) RETURNING *`,
      [quoteId, plan.backorders.length ? 'backordered' : 'allocated', allocationMode]
    );
    const order = orders[0];
    for (const allocation of plan.allocations) {
      const line = context.lines.find((item) => item.id === allocation.quotationLineId);
      const reservation = await client.query(
        `UPDATE inventory_levels
         SET quantity_reserved = quantity_reserved + $1
         WHERE warehouse_id = $2 AND product_id = $3
           AND quantity_on_hand - quantity_reserved >= $1`,
        [allocation.quantity, allocation.warehouseId, line.product_id]
      );
      if (reservation.rowCount !== 1) throw new AppError(409, 'INVENTORY_CHANGED', 'Stock changed while this fulfillment plan was being accepted.');
      await client.query(
        `INSERT INTO fulfillment_allocations (fulfillment_order_id, quotation_line_id, warehouse_id, quantity, status)
         VALUES ($1, $2, $3, $4, 'allocated')`,
        [order.id, allocation.quotationLineId, allocation.warehouseId, allocation.quantity]
      );
    }
    for (const backorder of plan.backorders) {
      await client.query(
        `INSERT INTO fulfillment_backorders (fulfillment_order_id, quotation_line_id, preferred_warehouse_id, quantity)
         VALUES ($1, $2, $3, $4)`,
        [order.id, backorder.quotationLineId, backorder.preferredWarehouseId, backorder.quantity]
      );
    }
    await client.query(`UPDATE quotations SET status = 'in_fulfillment', last_activity_at = now(), updated_at = now() WHERE id = $1`, [quoteId]);
    await writeAuditAndOutbox(client, {
      aggregateType: 'fulfillment_order',
      aggregateId: order.id,
      eventType: 'fulfillment.planned',
      actorUserId,
      afterState: order,
      metadata: { quotationId: quoteId, allocationMode, shipmentCount: plan.shipmentCount, estimatedShipmentCost: plan.estimatedShipmentCost, backorderCount: plan.backorders.length }
    });
    return { order, ...plan };
  });
}

export async function acceptSuggestedFulfillment(quoteId, actorUserId) {
  return persistPlan(quoteId, actorUserId, 'suggested', buildAutomaticPlan);
}

export async function acceptManualFulfillment(quoteId, actorUserId, allocations) {
  return persistPlan(quoteId, actorUserId, 'manual', (context) => buildManualPlan(context, allocations));
}

export async function getFulfillmentOrder(fulfillmentOrderId) {
  const { rows: orders } = await pool.query(`SELECT * FROM fulfillment_orders WHERE id = $1`, [fulfillmentOrderId]);
  if (!orders[0]) throw new AppError(404, 'FULFILLMENT_NOT_FOUND', 'Fulfillment order was not found.');
  const [allocations, backorders] = await Promise.all([
    pool.query(`SELECT fa.*, w.code AS warehouse_code, w.name AS warehouse_name, ql.line_number, ql.description FROM fulfillment_allocations fa JOIN warehouses w ON w.id = fa.warehouse_id JOIN quotation_lines ql ON ql.id = fa.quotation_line_id WHERE fa.fulfillment_order_id = $1 ORDER BY ql.line_number`, [fulfillmentOrderId]),
    pool.query(`SELECT fb.*, w.code AS preferred_warehouse_code, ql.line_number, ql.description FROM fulfillment_backorders fb LEFT JOIN warehouses w ON w.id = fb.preferred_warehouse_id JOIN quotation_lines ql ON ql.id = fb.quotation_line_id WHERE fb.fulfillment_order_id = $1 ORDER BY ql.line_number`, [fulfillmentOrderId])
  ]);
  return { ...orders[0], allocations: allocations.rows, backorders: backorders.rows };
}
