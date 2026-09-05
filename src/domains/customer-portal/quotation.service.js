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
