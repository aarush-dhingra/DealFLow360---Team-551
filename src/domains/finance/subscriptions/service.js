/**
 * Subscription service — cancellation and mid-cycle quantity changes.
 *
 * Each action runs in one transaction: business writes (subscription state /
 * schedule / credit note) + audit + outbox commit atomically. Proration math
 * lives in proration.js/rules.js; this file wires them to the repository.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import { compare, lt, subtract } from '../../../shared/money.js';
import {
  assertCanCancel,
  assertCanChangeQuantity,
  computeCancellationRefund
} from './rules.js';
import {
  periodContaining,
  prorateQuantityDelta,
  unitPricePerPeriod,
  fullPeriodAmountAtQuantity
} from './proration.js';
import * as repo from './repository.js';

export async function cancelSubscription({ subscriptionId, effectiveDate, reason, principal }) {
  if (!subscriptionId || typeof subscriptionId !== 'string') {
    throw Errors.validation('subscriptionId is required');
  }
  const atIso = effectiveDate ? new Date(effectiveDate).toISOString() : new Date().toISOString();

  return withTransaction(async (client) => {
    const sub = await repo.findSubscription(client, subscriptionId);
    if (!sub) throw Errors.notFound('Subscription not found.');
    assertCanCancel(sub.status);

    const prepaidAmount = await repo.findCurrentPrepaidAmount(client, subscriptionId);
    const refund = computeCancellationRefund({
      anchorIso: sub.startedAt ?? atIso,
      intervalUnit: sub.intervalUnit,
      atIso,
      prepaidAmount,
      cancellationPolicy: sub.cancellationPolicy
    });

    let creditNoteId = null;
    if (compare(refund, '0') > 0) {
      const note = await repo.insertCreditNote(client, {
        amount: refund,
        reason: reason ?? `Subscription ${subscriptionId} cancelled`,
        createdByUserId: principal.userId
      });
      creditNoteId = note.id;
    }

    const updated = await repo.markSubscriptionCancelled(client, { subscriptionId, endsAt: atIso });
    if (!updated) throw Errors.staleVersion('Subscription changed concurrently; reload and retry.');

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'subscription',
      aggregateId: subscriptionId,
      eventType: 'subscription.cancelled',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { status: sub.status },
      afterState: { status: 'cancelled', endsAt: atIso, refund, creditNoteId },
      metadata: { reason: reason ?? null }
    });
    outbox.record({
      aggregateType: 'subscription',
      aggregateId: subscriptionId,
      eventType: 'subscription.cancelled',
      payload: { subscriptionId, endsAt: atIso, refund, creditNoteId }
    });
    await audit.flush();
    await outbox.flush();

    return { subscriptionId, status: 'cancelled', endsAt: atIso, refund, creditNoteId };
  });
}

export async function changeSubscriptionQuantity({
  subscriptionId,
  newQuantity,
  effectiveDate,
  reason,
  principal
}) {
  if (!subscriptionId || typeof subscriptionId !== 'string') {
    throw Errors.validation('subscriptionId is required');
  }
  if (typeof newQuantity !== 'string' || !/^\d+(\.\d+)?$/.test(newQuantity) || compare(newQuantity, '0') <= 0) {
    throw Errors.validation('newQuantity must be a decimal string greater than zero');
  }
  const atIso = effectiveDate ? new Date(effectiveDate).toISOString() : new Date().toISOString();

  return withTransaction(async (client) => {
    const sub = await repo.findSubscription(client, subscriptionId);
    if (!sub) throw Errors.notFound('Subscription not found.');
    assertCanChangeQuantity(sub.status);
    if (!sub.quotationLineId) {
      throw Errors.invalidTransition('Subscription has no quotation line to prorate.');
    }

    const line = await repo.findLineQuantity(client, sub.quotationLineId);
    if (!line) throw Errors.notFound('Subscribed quotation line not found.');
    const oldQuantity = line.quantity;

    const prepaidAmount = await repo.findCurrentPrepaidAmount(client, subscriptionId);
    const anchorIso = sub.startedAt ?? atIso;
    const { startIso, endIso } = periodContaining(anchorIso, sub.intervalUnit, atIso);

    const unit = unitPricePerPeriod({ scheduleAmount: prepaidAmount, previousQuantity: oldQuantity });
    const deltaQuantity = subtract(newQuantity, oldQuantity);

    // Prorated delta for the remainder of the current period.
    const proratedDelta = prorateQuantityDelta({
      unitAmount: unit,
      deltaQuantity,
      startIso,
      endIso,
      atIso
    });

    let creditNoteId = null;
    let chargeScheduleId = null;

    if (lt(proratedDelta, '0')) {
      // Decrease -> prorated credit note (floating until applied).
      const note = await repo.insertCreditNote(client, {
        amount: proratedDelta.slice(1),
        reason: reason ?? `Subscription ${subscriptionId} quantity reduced mid-cycle`,
        createdByUserId: principal.userId
      });
      creditNoteId = note.id;
    } else if (compare(proratedDelta, '0') > 0) {
      // Increase -> prorated charge schedule due immediately.
      const schedule = await repo.insertSchedule(client, {
        subscriptionId,
        dueAt: atIso,
        amount: proratedDelta,
        status: 'pending',
        creditNoteId: null
      });
      chargeScheduleId = schedule.id;
    }

    // Next full period is billed at the new quantity.
    const nextAmount = fullPeriodAmountAtQuantity({
      scheduleAmount: prepaidAmount,
      previousQuantity: oldQuantity,
      newQuantity
    });
    const nextDue = new Date(endIso).toISOString();
    const nextSchedule = await repo.insertSchedule(client, {
      subscriptionId,
      dueAt: nextDue,
      amount: nextAmount,
      status: 'pending',
      creditNoteId: null
    });

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'subscription',
      aggregateId: subscriptionId,
      eventType: 'subscription.prorated',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { quantity: oldQuantity, status: sub.status },
      afterState: {
        quantity: newQuantity,
        proratedDelta,
        creditNoteId,
        chargeScheduleId,
        nextScheduleId: nextSchedule.id,
        nextFullPeriodAmount: nextAmount
      },
      metadata: { reason: reason ?? null, effectiveAt: atIso }
    });
    outbox.record({
      aggregateType: 'subscription',
      aggregateId: subscriptionId,
      eventType: 'subscription.prorated',
      payload: {
        subscriptionId,
        quantity: newQuantity,
        proratedDelta,
        creditNoteId,
        chargeScheduleId,
        nextFullPeriodAmount: nextAmount
      }
    });
    await audit.flush();
    await outbox.flush();

    return {
      subscriptionId,
      oldQuantity,
      newQuantity,
      proratedDelta,
      creditNoteId,
      chargeScheduleId,
      nextFullPeriodAmount: nextAmount
    };
  });
}
