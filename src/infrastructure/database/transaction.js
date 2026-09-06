import { pool } from './pool.js';
import { publishChange } from '../realtime.js';

export async function inTransaction(work) {
  const client = await pool.connect();
  const changes = [];
  client.realtimeChanges = changes;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    changes.forEach(publishChange);
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    delete client.realtimeChanges;
    client.release();
  }
}

export async function writeAuditAndOutbox(client, { aggregateType, aggregateId, eventType, actorUserId, beforeState = null, afterState = null, metadata = {} }) {
  const quotationId = metadata.quotationId ?? (aggregateType === 'quotation' ? aggregateId : null);
  await client.query(
    `INSERT INTO audit_events (aggregate_type, aggregate_id, quotation_id, event_type, actor_user_id, before_state, after_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [aggregateType, aggregateId, quotationId, eventType, actorUserId, beforeState, afterState, metadata]
  );
  await client.query(
    `INSERT INTO outbox_events (aggregate_type, aggregate_id, event_type, payload)
     VALUES ($1, $2, $3, $4)`,
    [aggregateType, aggregateId, eventType, { aggregateId, eventType, metadata }]
  );
  client.realtimeChanges?.push({ aggregateType, aggregateId, quotationId, eventType });
}

export const withTransaction = inTransaction;
