// Deal health batch job — runs on a schedule to score all open quotes.
// In production, trigger via pg_cron or an external scheduler.

import { pool } from '../infrastructure/database/pool.js';
import * as dealHealthRepo from '../domains/deal-health/repository.js';
import { computeBand } from '../domains/deal-health/policy.js';

export async function runDealHealthScan() {
  const policy = await dealHealthRepo.getActiveDealHealthPolicy();
  if (!policy) {
    console.warn('[deal-health-job] No active deal health policy — skipping scan');
    return 0;
  }

  const { rows: openQuotes } = await pool.query(
    `SELECT id FROM quotations
     WHERE status NOT IN ('paid', 'rejected', 'cancelled', 'expired', 'superseded', 'fulfilled')`
  );

  let assessed = 0;
  for (const { id } of openQuotes) {
    try {
      const result = await dealHealthRepo.assessAndStore(id, policy);
      if (result) {
        const band = computeBand(result.score, policy);
        console.log(`[deal-health-job] ${id} → score=${result.score} band=${band}`);
        assessed++;
      }
    } catch (err) {
      console.error(`[deal-health-job] failed for ${id}:`, err.message);
    }
  }

  return assessed;
}
