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
 *     in_fulfillment (or partially_fulfilled when any backorder remains),
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
    return {
      quotationId,
      quoteStatus: quote.status,
      lineCount: lines.length,
      hasBackorder: plan.allocations.some((a) => a.status === 'backordered'),
      shipmentCount: plan.shipmentCount,
      shippingCostTotal: plan.shippingCostTotal,
      allocations: plan.allocations
    };
  });
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
    const quoteStatusAfter = hasBackorder ? 'partially_fulfilled' : 'in_fulfillment';

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
