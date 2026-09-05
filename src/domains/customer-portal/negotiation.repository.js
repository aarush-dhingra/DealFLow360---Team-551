import { pool } from '../../infrastructure/database/pool.js';

export async function getThread(quotationId, { limit = 100, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT
       nm.id, nm.origin, nm.message_text,
       nm.requested_discount_percent, nm.created_at,
       nm.quotation_version_id,
       nm.quotation_line_id,
       u.display_name AS internal_user_name,
       cc.display_name AS customer_contact_name
     FROM negotiation_messages nm
     LEFT JOIN users u ON u.id = nm.internal_user_id
     LEFT JOIN customer_contacts cc ON cc.id = nm.customer_contact_id
     WHERE nm.quotation_id = $1
     ORDER BY nm.created_at ASC
     LIMIT $2 OFFSET $3`,
    [quotationId, limit, offset]
  );
  return rows;
}

// Inserts a customer negotiation message within an existing transaction client.
export async function insertCustomerMessage(client, {
  quotationId,
  quotationVersionId,
  quotationLineId,
  customerContactId,
  messageText,
  requestedDiscountPercent,
}) {
  const { rows } = await client.query(
    `INSERT INTO negotiation_messages
       (quotation_id, quotation_version_id, quotation_line_id,
        origin, customer_contact_id, message_text, requested_discount_percent)
     VALUES ($1, $2, $3, 'customer', $4, $5, $6)
     RETURNING id, created_at`,
    [
      quotationId,
      quotationVersionId ?? null,
      quotationLineId ?? null,
      customerContactId,
      messageText,
      requestedDiscountPercent ?? null,
    ]
  );
  return rows[0];
}

// Resolves customer_contact_id from userEmail + customerId.
export async function resolveContactId(userEmail, customerId) {
  const { rows } = await pool.query(
    `SELECT id FROM customer_contacts WHERE email = $1 AND customer_id = $2 LIMIT 1`,
    [userEmail, customerId]
  );
  return rows[0]?.id ?? null;
}
