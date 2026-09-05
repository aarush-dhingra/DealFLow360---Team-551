/**
 * Payments application service.
 *
 * Applies a payment (or voids an invoice) in one transaction, guarded by the
 * invoice lock_version so two concurrent requests cannot both succeed. Audit +
 * outbox rows commit atomically with the payment.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import { validatePayment, canVoidInvoice } from './rules.js';
import * as repo from './repository.js';
import { evaluateAutomaticTier } from '../../customers/tiering.service.js';

export async function applyPayment({ invoiceId, amount, method, externalReference, principal }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw Errors.validation('invoiceId is required');
  if (!method || method.trim() === '') throw Errors.validation('payment method is required');

  return withTransaction(async (client) => {
    const invoice = await repo.findInvoice(client, invoiceId);
    if (!invoice) throw Errors.notFound('Invoice not found.');
    invoice.appliedCredits = await repo.findAppliedCredits(client, invoiceId);

    const { amountPaidAfter, statusAfter } = validatePayment({ invoice, amount });

    const paidAt = new Date().toISOString();
    await repo.insertPayment(client, {
      invoiceId,
      amount,
      method,
      externalReference,
      paidAt
    });

    const updated = await repo.applyPayment(client, {
      invoiceId,
      amountPaid: amountPaidAfter,
      status: statusAfter,
      expectedLockVersion: invoice.lockVersion
    });
    if (!updated) throw Errors.staleVersion('Invoice changed concurrently; reload and retry.');

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'invoice',
      aggregateId: invoiceId,
      quotationId: invoice.quotationId,
      eventType: 'invoice.payment_received',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { amountPaid: invoice.amountPaid, status: invoice.status },
      afterState: { amountPaid: amountPaidAfter, status: statusAfter },
      metadata: { amount, method, externalReference: externalReference ?? null, paidAt }
    });
    outbox.record({
      aggregateType: 'invoice',
      aggregateId: invoiceId,
      eventType: 'invoice.payment_received',
      payload: { invoiceId, quotationId: invoice.quotationId, amount, status: statusAfter, paidAt }
    });
    await audit.flush();
    await outbox.flush();
    const tierChange = statusAfter === 'paid' && invoice.status !== 'paid'
      ? await evaluateAutomaticTier(client, invoice.customerId)
      : null;

    return { invoiceId, amount, amountPaid: amountPaidAfter, status: statusAfter, paidAt, tierChange };
  });
}

export async function voidInvoice({ invoiceId, principal }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw Errors.validation('invoiceId is required');

  return withTransaction(async (client) => {
    const invoice = await repo.findInvoice(client, invoiceId);
    if (!invoice) throw Errors.notFound('Invoice not found.');
    invoice.appliedCredits = await repo.findAppliedCredits(client, invoiceId);

    if (!canVoidInvoice(invoice)) {
      throw Errors.invalidTransition(
        'Only an unpaid invoice with no applied credits can be voided.'
      );
    }

    const updated = await repo.voidInvoice(client, {
      invoiceId,
      expectedLockVersion: invoice.lockVersion
    });
    if (!updated) throw Errors.staleVersion('Invoice changed concurrently; reload and retry.');

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'invoice',
      aggregateId: invoiceId,
      quotationId: invoice.quotationId,
      eventType: 'invoice.voided',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { status: invoice.status },
      afterState: { status: 'void' },
      metadata: {}
    });
    outbox.record({
      aggregateType: 'invoice',
      aggregateId: invoiceId,
      eventType: 'invoice.voided',
      payload: { invoiceId, quotationId: invoice.quotationId, voidedAt: new Date().toISOString() }
    });
    await audit.flush();
    await outbox.flush();

    return { invoiceId, status: 'void' };
  });
}
