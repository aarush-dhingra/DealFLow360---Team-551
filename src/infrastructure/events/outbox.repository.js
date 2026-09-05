import { pool } from '../database/pool.js';

export async function fetchUnpublished(limit = 100) {
  const { rows } = await pool.query(
    `SELECT id, aggregate_type, aggregate_id, event_type, payload, created_at
     FROM outbox_events
     WHERE published_at IS NULL
     ORDER BY created_at ASC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export async function markPublished(ids) {
  if (!ids.length) return;
  await pool.query(
    `UPDATE outbox_events SET published_at = now()
     WHERE id = ANY($1::uuid[])`,
    [ids]
  );
}

export async function markFailed(id, errorMessage) {
  await pool.query(
    `UPDATE outbox_events
     SET status = 'failed', attempts = attempts + 1
     WHERE id = $1`,
    [id]
  );
}
