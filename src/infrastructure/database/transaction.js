/**
 * Transaction helper.
 *
 * Every business write runs inside one PostgreSQL transaction so business
 * rows, audit events, and outbox events commit together or roll back together.
 * `fn` receives a client checked out from the shared pool and must use that
 * client for every query in the unit of work.
 */

import { pool } from './pool.js';

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original error even if rollback fails.
    }
    throw error;
  } finally {
    client.release();
  }
}
