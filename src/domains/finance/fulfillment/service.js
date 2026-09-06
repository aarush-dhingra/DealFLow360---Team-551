/**
 * Fulfillment allocation service.
 *
 * Accepts the suggested split or applies a finance manual override in one
 * transaction:
 *   - locks the quote row,
 *   - reads only physical (one-time) lines of the current version,
 *   - reserves stock with guarded updates (never over-allocates),
 *   - writes allocation rows (allocated/backordered),
 *   - on the initial suggested allocation advances the quote to
 *     in_fulfillment while the order tracks any remaining backorders,
 *   - writes audit + outbox rows atomically.
 *
 * Duplicate live fulfillment orders are prevented by the partial unique index
 * on fulfillment_orders(quotation_id) where status <> 'cancelled'; a manual
 * override re-allocates the existing live order instead of creating a second.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import { subtract, compare, add } from '../../../shared/money.js';
import { buildAvailabilityMap, suggestAllocations, canAllocate } from './planning.js';
import { validateManualAllocation } from './allocation.js';
import * as repo from './repository.js';

const MODES = Object.freeze(['suggested', 'manual']);

/**
 * Read-only recommended split for the quote's current physical lines. Used by
 * Manager/Finance views before any order is created. No writes.
 */
export async function previewFulfillmentPlan({ quotationId }) {
  if (!quotationId || typeof quotationId !== 'string') {
    throw Errors.validation('quotationId is required');
  }
  return withTransaction(async (client) => {
    const quote = await repo.findQuote(client, quotationId);
    if (!quote) throw Errors.notFound('Quotation not found.');
    const lines = await repo.findPhysicalLines(client, quotationId);
    const [inventory, warehouses] = await Promise.all([
      repo.findInventory(client),
      repo.findWarehouses(client)
    ]);
    const plan = suggestAllocations({ lines, inventory, warehouses });
    const productById = new Map(lines.map((line) => [line.productId, line.productName]));
    const warehouseById = new Map(warehouses.map((warehouse) => [warehouse.id, warehouse.name || warehouse.code]));
    return {
      quotationId,
      quoteStatus: quote.status,
      lineCount: lines.length,
      hasBackorder: plan.allocations.some((a) => a.status === 'backordered'),
      shipmentCount: plan.shipmentCount,
      shippingCostTotal: plan.shippingCostTotal,
      allocations: plan.allocations.map((allocation) => ({
        ...allocation,
        productName: productById.get(allocation.productId) ?? 'Product',
        warehouseName: warehouseById.get(allocation.warehouseId) ?? 'Unassigned warehouse'
      }))
    };
  });
}

export async function listFulfillmentQueue() {
  const { pool } = await import('../../../infrastructure/database/pool.js');
  const { rows } = await pool.query(
    `SELECT q.id, q.quote_number, q.status, c.legal_name AS customer_name,
            qv.grand_total, qv.currency_code, q.last_activity_at
     FROM quotations q
     JOIN customers c ON c.id=q.customer_id
     JOIN quotation_versions qv ON qv.quotation_id=q.id AND qv.version_number=q.current_version_number
     WHERE q.status IN ('approved','customer_confirmed','confirmed','in_fulfillment')
     ORDER BY q.last_activity_at DESC`
  );
  return rows;
}

export async function allocateFulfillment({ quotationId, mode, manualAllocations, principal }) {
  if (!MODES.includes(mode)) {
    throw Errors.validation(`mode must be one of: ${MODES.join(', ')}`);
  }
  if (mode === 'manual' && (!Array.isArray(manualAllocations) || manualAllocations.length === 0)) {
    throw Errors.validation('manualAllocations[] is required when mode is "manual"');
  }

  return withTransaction(async (client) => {
    const quote = await repo.lockQuote(client, quotationId);
    if (!quote) throw Errors.notFound('Quotation not found.');
    if (!canAllocate(quote.status)) {
      throw Errors.invalidTransition(`Quotation status "${quote.status}" cannot be fulfilled.`);
    }

    const lines = await repo.findPhysicalLines(client, quotationId);
    if (lines.length === 0) {
      throw Errors.invalidTransition('Quotation has no physical lines to fulfill.');
    }

    const [inventory, warehouses] = await Promise.all([
      repo.findInventory(client),
      repo.findWarehouses(client)
    ]);
    if (warehouses.length === 0) throw Errors.validation('No active warehouses configured.');

    const liveOrder = await repo.findLiveOrder(client, quotationId);
    let plan;

    if (mode === 'manual') {
      if (!liveOrder) throw Errors.invalidTransition('No live fulfillment order to override.');
      const locked = await repo.lockOrder(client, liveOrder.id);
      if (!locked) throw Errors.staleVersion('Fulfillment order changed concurrently.');

      // Release this order's current reservations, then cancel its allocations.
      const existing = await repo.findOrderAllocations(client, liveOrder.id);
      for (const alloc of existing) {
        if (alloc.status === 'allocated') {
          await repo.releaseStock(client, {
            warehouseId: alloc.warehouseId,
            productId: alloc.productId,
            quantity: alloc.quantity
          });
        }
        await repo.cancelAllocation(client, alloc.id);
      }

      const availability = buildAvailabilityMap(await repo.findInventory(client));
      plan = validateManualAllocation({
        lines,
        requested: manualAllocations,
        availabilityMap: availability,
        warehouses,
        inventory
      });
      await persistAllocations(client, liveOrder.id, plan.allocations);
      await repo.updateOrderState(client, {
        id: liveOrder.id,
        status: plan.allocations.some((a) => a.status === 'backordered') ? 'backordered' : 'allocated',
        allocationMode: 'manual'
      });
      await writeAudit(client, {
        quotationId,
        orderId: liveOrder.id,
        principal,
        eventType: 'fulfillment.manual_override',
        plan,
        quoteStatus: quote.status,
        quoteStatusAfter: quote.status // override does not re-transition the quote
      });
      return summarize(liveOrder.id, quote, plan, 'manual', quote.status);
    }

    // Suggested allocation: only when no live order exists yet.
    if (liveOrder) throw Errors.invalidTransition('Quotation already has a live fulfillment order.');
    const created = await repo.insertOrder(client, { quotationId, allocationMode: 'suggested' });
    plan = suggestAllocations({ lines, inventory, warehouses });

    const hasBackorder = plan.allocations.some((a) => a.status === 'backordered');
    const quoteStatusAfter = 'in_fulfillment';

    await persistAllocations(client, created.id, plan.allocations);
    await repo.updateOrderState(client, {
      id: created.id,
      status: hasBackorder ? 'backordered' : 'allocated',
      allocationMode: 'suggested'
    });
    const advanced = await repo.updateQuoteStatus(client, {
      quotationId,
      status: quoteStatusAfter,
      expectedLockVersion: quote.lockVersion
    });
    if (!advanced) throw Errors.staleVersion('Quotation changed concurrently; reload and retry.');

    await writeAudit(client, {
      quotationId,
      orderId: created.id,
      principal,
      eventType: 'fulfillment.allocated',
      plan,
      quoteStatus: quote.status,
      quoteStatusAfter
    });
    return summarize(created.id, quote, plan, 'suggested', quoteStatusAfter);
  });
}

async function persistAllocations(client, fulfillmentOrderId, allocations) {
  for (const alloc of allocations) {
    if (alloc.status === 'allocated') {
      // Guarded reservation: if stock vanished concurrently, roll back.
      const ok = await repo.reserveStock(client, {
        warehouseId: alloc.warehouseId,
        productId: alloc.productId,
        quantity: alloc.quantity
      });
      if (!ok) throw Errors.insufficientStock('Stock changed concurrently; reload and retry.');
    }
    await repo.insertAllocation(client, {
      fulfillmentOrderId,
      quotationLineId: alloc.quotationLineId,
      warehouseId: alloc.warehouseId,
      quantity: alloc.quantity,
      status: alloc.status
    });
  }
}

async function writeAudit(
  client,
  { quotationId, orderId, principal, eventType, plan, quoteStatus, quoteStatusAfter }
) {
  const audit = new AuditCollector(client);
  const outbox = new OutboxCollector(client);
  audit.record({
    aggregateType: 'fulfillment_order',
    aggregateId: orderId,
    quotationId,
    eventType,
    actorUserId: principal.userId,
    requestId: principal.requestId ?? null,
    beforeState: { quoteStatus },
    afterState: { quoteStatus: quoteStatusAfter, allocationCount: plan.allocations.length },
    metadata: { shipmentCount: plan.shipmentCount, shippingCostTotal: plan.shippingCostTotal }
  });
  outbox.record({
    aggregateType: 'fulfillment_order',
    aggregateId: orderId,
    eventType,
    payload: {
      quotationId,
      orderId,
      quoteStatusAfter,
      hasBackorder: plan.allocations.some((a) => a.status === 'backordered'),
      allocationCount: plan.allocations.length
    }
  });
  await audit.flush();
  await outbox.flush();
  client.realtimeChanges?.push({ aggregateType: 'fulfillment_order', aggregateId: orderId, quotationId, eventType });
}

/**
 * Commit the physical shipment for a fully allocated order. Allocation only
 * reserves stock; shipping is the irreversible point where on-hand inventory
 * is reduced. Backordered orders must be consolidated before they can ship.
 */
export async function shipFulfillment({ quotationId, principal }) {
  return withTransaction(async (client) => {
    const quote = await repo.lockQuote(client, quotationId);
    if (!quote) throw Errors.notFound('Quotation not found.');
    const liveOrder = await repo.findLiveOrder(client, quotationId);
    if (!liveOrder) throw Errors.invalidTransition('No fulfillment order exists for this quotation.');
    const order = await repo.lockOrder(client, liveOrder.id);
    if (!order || order.status !== 'allocated') {
      throw Errors.invalidTransition('Only a fully allocated order can be shipped. Consolidate any backorders first.');
    }
    const allocations = await repo.findOrderAllocations(client, order.id);
    const allocated = allocations.filter((allocation) => allocation.status === 'allocated');
    if (allocated.length === 0) throw Errors.invalidTransition('This order has no allocated stock to ship.');
    for (const allocation of allocated) {
      const consumed = await repo.consumeReservedStock(client, {
        warehouseId: allocation.warehouseId,
        productId: allocation.productId,
        quantity: allocation.quantity
      });
      if (!consumed) throw Errors.insufficientStock('Reserved stock changed concurrently; reload and try again.');
    }
    await repo.markAllocationsShipped(client, order.id);
    await repo.updateOrderState(client, { id: order.id, status: 'shipped', allocationMode: order.allocationMode });
    const advanced = await repo.updateQuoteStatus(client, { quotationId, status: 'fulfilled', expectedLockVersion: quote.lockVersion });
    if (!advanced) throw Errors.staleVersion('Quotation changed concurrently; reload and retry.');
    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({ aggregateType: 'fulfillment_order', aggregateId: order.id, quotationId, eventType: 'fulfillment.shipped', actorUserId: principal.userId, requestId: principal.requestId ?? null, beforeState: { orderStatus: order.status, quoteStatus: quote.status }, afterState: { orderStatus: 'shipped', quoteStatus: 'fulfilled' }, metadata: { allocationCount: allocated.length } });
    outbox.record({ aggregateType: 'fulfillment_order', aggregateId: order.id, eventType: 'fulfillment.shipped', payload: { quotationId, orderId: order.id, allocationCount: allocated.length } });
    await audit.flush();
    await outbox.flush();
    client.realtimeChanges?.push({ aggregateType: 'fulfillment_order', aggregateId: order.id, quotationId, eventType: 'fulfillment.shipped' });
    return { quotationId, fulfillmentOrderId: order.id, status: 'fulfilled', shippedAllocations: allocated.length };
  });
}

/**
 * Re-attempt fulfillment of the order's backordered allocations against the
 * current live stock. Existing 'allocated' rows and their stock reservations
 * are never cancelled or released — only the still-backordered rows are
 * reduced or completed, and any newly covered quantity is reserved and written
 * as an allocated allocation.
 */
export async function consolidateBackorders({ quotationId, principal }) {
  if (!quotationId || typeof quotationId !== 'string') {
    throw Errors.validation('quotationId is required');
  }
  return withTransaction(async (client) => {
    const quote = await repo.findQuote(client, quotationId);
    if (!quote) throw Errors.notFound('Quotation not found.');

    const liveOrder = await repo.findLiveOrder(client, quotationId);
    if (!liveOrder) throw Errors.invalidTransition('No live fulfillment order to consolidate.');
    const order = await repo.lockOrder(client, liveOrder.id);
    if (!order) throw Errors.staleVersion('Fulfillment order changed concurrently.');

    const warehouses = await repo.findWarehouses(client);
    let backorders = await repo.findBackorders(client, order.id);
    if (backorders.length === 0) {
      return { quotationId, fulfillmentOrderId: order.id, consolidated: 0, remainingBackorders: 0 };
    }

    let consolidatedQty = '0';
    let consolidatedRows = 0;
    for (const backorder of backorders) {
      let remaining = backorder.quantity;

      // Repeatedly allocate what the current stock can cover; re-read inventory
      // after each reservation so we never double-book.
      for (;;) {
        if (compare(remaining, '0') === 0) break;
        const inventory = await repo.findInventory(client);
        const plan = suggestAllocations({
          lines: [
            {
              quotationLineId: backorder.quotationLineId,
              productId: backorder.productId,
              quantity: remaining
            }
          ],
          inventory,
          warehouses
        });
        const coverable = plan.allocations.filter((a) => a.status === 'allocated');
        if (coverable.length === 0) break;

        for (const alloc of coverable) {
          const ok = await repo.reserveStock(client, {
            warehouseId: alloc.warehouseId,
            productId: alloc.productId,
            quantity: alloc.quantity
          });
          if (!ok) throw Errors.insufficientStock('Stock changed concurrently; reload and retry.');
          await repo.insertAllocation(client, {
            fulfillmentOrderId: order.id,
            quotationLineId: backorder.quotationLineId,
            warehouseId: alloc.warehouseId,
            quantity: alloc.quantity,
            status: 'allocated'
          });
          consolidatedQty = add(consolidatedQty, alloc.quantity);
          consolidatedRows += 1;
          remaining = subtract(remaining, alloc.quantity);
        }
      }

      // Close or shrink the original backorder row.
      const coveredNow = subtract(backorder.quantity, remaining);
      if (compare(coveredNow, '0') !== 0) {
        const outcome =
          compare(coveredNow, backorder.quantity) >= 0
            ? { quantity: backorder.quantity, status: 'cancelled' }
            : { quantity: remaining, status: 'backordered' };
        await repo.updateAllocation(client, {
          id: backorder.id,
          fulfillmentOrderId: order.id,
          quantity: outcome.quantity,
          status: outcome.status
        });
      }
    }

    // Recompute order state from the remaining backorders.
    backorders = (await repo.findBackorders(client, order.id)).filter((b) => compare(b.quantity, '0') > 0);
    const orderStatus = backorders.length > 0 ? 'backordered' : 'allocated';
    await repo.updateOrderState(client, {
      id: order.id,
      status: orderStatus,
      allocationMode: order.allocationMode
    });

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    const now = new Date().toISOString();
    audit.record({
      aggregateType: 'fulfillment_order',
      aggregateId: order.id,
      quotationId,
      eventType: 'fulfillment.backorder_consolidated',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { orderStatus: 'backordered' },
      afterState: { orderStatus, consolidatedQty, consolidatedRows, remainingBackorders: backorders.length },
      metadata: { at: now }
    });
    outbox.record({
      aggregateType: 'fulfillment_order',
      aggregateId: order.id,
      eventType: 'fulfillment.backorder_consolidated',
      payload: { quotationId, orderId: order.id, consolidatedQty, consolidatedRows, orderStatus, at: now }
    });
    await audit.flush();
    await outbox.flush();
    client.realtimeChanges?.push({ aggregateType: 'fulfillment_order', aggregateId: order.id, quotationId, eventType: 'fulfillment.backorder_consolidated' });

    return {
      quotationId,
      fulfillmentOrderId: order.id,
      consolidatedQty,
      consolidatedRows,
      remainingBackorders: backorders.length,
      orderStatus
    };
  });
}

function summarize(orderId, quote, plan, mode, quoteStatus) {
  return {
    fulfillmentOrderId: orderId,
    quotationId: quote.id,
    quoteStatus,
    allocationMode: mode,
    hasBackorder: plan.allocations.some((a) => a.status === 'backordered'),
    shipmentCount: plan.shipmentCount,
    shippingCostTotal: plan.shippingCostTotal,
    allocations: plan.allocations
  };
}

/** Read a fulfillment order and its allocation/backorder rows for Manager views. */
export async function getFulfillmentOrder({ fulfillmentOrderId }) {
  return withTransaction(async (client) => {
    const order = await repo.findOrder(client, fulfillmentOrderId);
    if (!order) throw Errors.notFound('Fulfillment order not found.');
    const allocations = await repo.findOrderAllocations(client, fulfillmentOrderId);
    return { ...order, allocations };
  });
}
