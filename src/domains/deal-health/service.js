import { NotFoundError } from '../../shared/http/errors.js';
import { computeBand } from './policy.js';
import * as repo from './repository.js';
import { getQuotationById } from '../quotations/repository.js';

export async function assessDealHealth(quotationId) {
  const policy = await repo.getActiveDealHealthPolicy();
  if (!policy) throw new Error('No active deal health policy configured');

  const result = await repo.assessAndStore(quotationId, policy);
  if (!result) throw new NotFoundError('Quotation');

  const band = computeBand(result.score, policy);
  return {
    quotation_id: quotationId,
    score: result.score,
    band,
    negotiation_turns: result.turns,
    quote_age_days: result.ageDays,
    inactivity_days: result.inactDays,
  };
}

export async function getDealHealthDashboard() {
  const [stalledDeals, discountAnomalies, pendingApprovals] = await Promise.all([
    repo.getStalledDeals(7),
    repo.getDiscountAnomalies(),
    repo.getPendingApprovalsSummary(),
  ]);

  const pendingByRole = {};
  for (const row of pendingApprovals) {
    pendingByRole[row.required_role] = parseInt(row.count, 10);
  }

  return {
    stalled_deals: stalledDeals,
    discount_anomalies: discountAnomalies,
    pending_approvals: {
      sales_manager: pendingByRole['sales_manager'] ?? 0,
      finance_operations: pendingByRole['finance_operations'] ?? 0,
      total: pendingApprovals.reduce((s, r) => s + parseInt(r.count, 10), 0),
    },
  };
}

export async function nudgeRep(quotationId, actorUserId) {
  const quote = await getQuotationById(quotationId);
  if (!quote) throw new NotFoundError('Quotation');
  await repo.nudgeRep(quotationId, actorUserId);
  return { nudged: true, quotation_id: quotationId };
}
