import { inTransaction, writeAuditAndOutbox } from '../../infrastructure/database/transaction.js';
import { ConflictError, ForbiddenError } from '../../shared/http/errors.js';
import { insertCustomerMessage, resolveContactId } from './negotiation.repository.js';

const ACCEPTABLE_STATUSES = ['sent_to_customer', 'approved'];
const COUNTER_STATUSES = ['sent_to_customer', 'approved', 'under_negotiation'];

export async function acceptQuote(userEmail, quotationId, lockVersion, customerId) {
  return inTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, status, lock_version, current_version_number
       FROM quotations WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [quotationId, customerId]
    );
    const quote = rows[0];

    if (!quote) throw new ForbiddenError('Quote not found or access denied');

    if (!ACCEPTABLE_STATUSES.includes(quote.status)) {
      throw new ConflictError(
        `Quote cannot be accepted in status '${quote.status}'. Expected: ${ACCEPTABLE_STATUSES.join(', ')}.`
      );
    }

    if (quote.lock_version !== lockVersion) {
      throw new ConflictError('Quote was updated by another party. Refresh and try again.');
    }

    const beforeState = { status: quote.status, lock_version: quote.lock_version };

    await client.query(
      `UPDATE quotations
       SET status = 'customer_confirmed',
           lock_version = lock_version + 1,
           last_activity_at = now(),
           updated_at = now()
       WHERE id = $1`,
      [quotationId]
    );

    // Create invoice for one-time lines; recurring lines are billed on a separate schedule.
    const { rows: versionRows } = await client.query(
      `SELECT qv.id, qv.currency_code,
              COALESCE(SUM(ql.net_line_value) FILTER (WHERE p.billing_kind = 'one_time'), 0) AS one_time_total,
              COALESCE(SUM(ql.net_line_value) FILTER (WHERE p.billing_kind = 'recurring'), 0) AS recurring_total,
              qv.grand_total
       FROM quotation_versions qv
       JOIN quotation_lines ql ON ql.quotation_version_id = qv.id
       JOIN products p ON p.id = ql.product_id
       WHERE qv.quotation_id = $1 AND qv.version_number = $2
       GROUP BY qv.id, qv.currency_code, qv.grand_total`,
      [quotationId, quote.current_version_number]
    );
    const ver = versionRows[0];
    if (ver) {
      const oneTimeAmt = parseFloat(ver.one_time_total);
      const recurringAmt = parseFloat(ver.recurring_total);
      const invoiceNumber = `INV-${Date.now()}-${quotationId.slice(0, 8).toUpperCase()}`;

      if (oneTimeAmt > 0) {
        await client.query(
          `INSERT INTO invoices (invoice_number, quotation_id, customer_id, currency_code, amount_due, amount_paid, status, issued_at, due_at)
           VALUES ($1, $2, $3, $4, $5, 0, 'issued', now(), now() + interval '30 days')`,
          [invoiceNumber, quotationId, customerId, ver.currency_code, oneTimeAmt]
        );
      }

      // Record a recurring billing event for the schedule if there are recurring lines
      if (recurringAmt > 0) {
        await client.query(
          `INSERT INTO invoices (invoice_number, quotation_id, customer_id, currency_code, amount_due, amount_paid, status, issued_at, due_at)
           VALUES ($1, $2, $3, $4, $5, 0, 'issued', now(), now() + interval '30 days')`,
          [`${invoiceNumber}-REC`, quotationId, customerId, ver.currency_code, recurringAmt]
        );
      }
    }

    await writeAuditAndOutbox(client, {
      aggregateType: 'quotation',
      aggregateId: quotationId,
      eventType: 'customer_accepted',
      actorUserId: null,
      beforeState,
      afterState: { status: 'customer_confirmed', lock_version: lockVersion + 1 },
      metadata: {
        quotationId,
        customerId,
        version_number: quote.current_version_number,
        actor: 'customer',
        actor_email: userEmail,
      },
    });

    return { status: 'customer_confirmed', lock_version: lockVersion + 1 };
  });
}

export async function submitCounter(
  userEmail,
  quotationId,
  lockVersion,
  customerId,
  { messageText, requestedDiscountPercent, lineId }
) {
  return inTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, status, lock_version, current_version_number,
              (SELECT id FROM quotation_versions
               WHERE quotation_id = q.id AND version_number = q.current_version_number) AS version_id
       FROM quotations q WHERE id = $1 AND customer_id = $2 FOR UPDATE`,
      [quotationId, customerId]
    );
    const quote = rows[0];

    if (!quote) throw new ForbiddenError('Quote not found or access denied');

    if (!COUNTER_STATUSES.includes(quote.status)) {
      throw new ConflictError(
        `Counter-offer not allowed in status '${quote.status}'. Expected: ${COUNTER_STATUSES.join(', ')}.`
      );
    }

    if (quote.lock_version !== lockVersion) {
      throw new ConflictError('Quote was updated by another party. Refresh and try again.');
    }

    const contactId = await resolveContactId(userEmail, customerId);
    if (!contactId) throw new ForbiddenError('Customer contact record not found');

    const beforeState = { status: quote.status, lock_version: quote.lock_version };

    const message = await insertCustomerMessage(client, {
      quotationId,
      quotationVersionId: quote.version_id,
      quotationLineId: lineId ?? null,
      customerContactId: contactId,
      messageText,
      requestedDiscountPercent: requestedDiscountPercent ?? null,
    });

    // Transition to under_negotiation unless already there
    if (quote.status !== 'under_negotiation') {
      await client.query(
        `UPDATE quotations
         SET status = 'under_negotiation',
             lock_version = lock_version + 1,
             last_activity_at = now(),
             updated_at = now()
         WHERE id = $1`,
        [quotationId]
      );
    } else {
      await client.query(
        `UPDATE quotations
         SET last_activity_at = now(), updated_at = now()
         WHERE id = $1`,
        [quotationId]
      );
    }

    await writeAuditAndOutbox(client, {
      aggregateType: 'quotation',
      aggregateId: quotationId,
      eventType: 'customer_counter_submitted',
      actorUserId: null,
      beforeState,
      afterState: { status: 'under_negotiation' },
      metadata: {
        quotationId,
        customerId,
        version_number: quote.current_version_number,
        message_id: message.id,
        requested_discount_percent: requestedDiscountPercent ?? null,
        line_id: lineId ?? null,
        actor: 'customer',
        actor_email: userEmail,
      },
    });

    return { message_id: message.id, status: 'under_negotiation', created_at: message.created_at };
  });
}
