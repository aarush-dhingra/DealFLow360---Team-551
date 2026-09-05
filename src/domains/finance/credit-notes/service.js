/**
 * Credit-notes application service.
 *
 * Issues and applies credit notes in single transactions. Issue validates the
 * amount against the outstanding balance; apply is single-use (issued ->
 * applied) and flips the invoice to 'credited' when credits cover the balance.
 * Concurrency is guarded by invoices.lock_version.
 */

import { withTransaction } from '../../../infrastructure/database/transaction.js';
import { AuditCollector } from '../../../infrastructure/events/audit.js';
import { OutboxCollector } from '../../../infrastructure/events/outbox.js';
import { Errors } from '../../../shared/errors.js';
import {
  validateCreditNoteIssue,
  validateCreditNoteApply,
  invoiceStatusAfterCredit,
  canTransitionCreditNote
} from './rules.js';
import * as repo from './repository.js';

export async function issueCreditNote({ invoiceId, amount, reason, principal }) {
  if (!invoiceId || typeof invoiceId !== 'string') throw Errors.validation('invoiceId is required');
  if (!reason || reason.trim() === '') throw Errors.validation('reason is required');

  return withTransaction(async (client) => {
    const invoice = await repo.findInvoice(client, invoiceId);
    if (!invoice) throw Errors.notFound('Invoice not found.');
    invoice.appliedCredits = await repo.findAppliedCredits(client, invoiceId);

    const appliedAfter = validateCreditNoteIssue({ invoice, amount });
    const note = await repo.insertCreditNote(client, {
      invoiceId,
      amount,
      reason,
      createdByUserId: principal.userId
    });

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'credit_note',
      aggregateId: note.id,
      quotationId: invoice.quotationId,
      eventType: 'credit_note.issued',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { status: 'issued', appliedAmount: '0' },
      afterState: { status: 'issued', amount },
      metadata: { reason, appliedCreditsCeiling: appliedAfter }
    });
    outbox.record({
      aggregateType: 'credit_note',
      aggregateId: note.id,
      eventType: 'credit_note.issued',
      payload: { creditNoteId: note.id, invoiceId, amount, quotationId: invoice.quotationId }
    });
    await audit.flush();
    await outbox.flush();

    return { creditNoteId: note.id, invoiceId, amount, status: 'issued' };
  });
}

export async function applyCreditNote({ creditNoteId, principal }) {
  if (!creditNoteId || typeof creditNoteId !== 'string') {
    throw Errors.validation('creditNoteId is required');
  }

  return withTransaction(async (client) => {
    const note = await repo.findCreditNote(client, creditNoteId);
    if (!note) throw Errors.notFound('Credit note not found.');
    if (!canTransitionCreditNote(note.status, 'applied')) {
      throw Errors.invalidTransition(
        `Credit note status "${note.status}" cannot be applied.`
      );
    }

    const invoice = await repo.findInvoice(client, note.invoiceId);
    if (!invoice) throw Errors.notFound('Invoice not found.');
    const alreadyApplied = await repo.findAppliedCredits(client, note.invoiceId);

    const appliedTotal = validateCreditNoteApply({
      invoice,
      amount: note.amount,
      alreadyApplied
    });
    const invoiceStatus = invoiceStatusAfterCredit({
      invoice,
      appliedCreditsTotal: appliedTotal
    });

    const updatedNote = await repo.applyCreditNote(client, creditNoteId);
    if (!updatedNote) throw Errors.staleVersion('Credit note changed concurrently; reload and retry.');

    let updatedInvoice = null;
    if (invoiceStatus !== invoice.status) {
      updatedInvoice = await repo.updateInvoiceStatus(client, {
        invoiceId: note.invoiceId,
        status: invoiceStatus,
        expectedLockVersion: invoice.lockVersion
      });
      if (!updatedInvoice) throw Errors.staleVersion('Invoice changed concurrently; reload and retry.');
    }

    const audit = new AuditCollector(client);
    const outbox = new OutboxCollector(client);
    audit.record({
      aggregateType: 'credit_note',
      aggregateId: creditNoteId,
      quotationId: invoice.quotationId,
      eventType: 'credit_note.applied',
      actorUserId: principal.userId,
      requestId: principal.requestId ?? null,
      beforeState: { status: 'issued', invoiceStatus: invoice.status },
      afterState: { status: 'applied', invoiceStatus: invoiceStatus ?? invoice.status },
      metadata: { amount: note.amount }
    });
    outbox.record({
      aggregateType: 'credit_note',
      aggregateId: creditNoteId,
      eventType: 'credit_note.applied',
      payload: {
        creditNoteId,
        invoiceId: note.invoiceId,
        amount: note.amount,
        invoiceStatus: invoiceStatus ?? invoice.status
      }
    });
    await audit.flush();
    await outbox.flush();

    return {
      creditNoteId,
      invoiceId: note.invoiceId,
      status: 'applied',
      invoiceStatus: invoiceStatus ?? invoice.status,
      appliedCreditsTotal: appliedTotal
    };
  });
}
