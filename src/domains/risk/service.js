import { NotFoundError, AppError } from '../../shared/http/errors.js';
import { determineRoute } from './policy.js';
import * as repo from './repository.js';
import { getActiveApprovalPolicy } from '../approvals/repository.js';

export async function assessQuoteVersion(quotationVersionId) {
  const policy = await getActiveApprovalPolicy();
  if (!policy) throw new AppError('No active approval policy configured', 500);

  // First pass to get blended risk (route placeholder)
  const { assessment } = await repo.computeAndStoreRisk(quotationVersionId, 'none', policy);

  const route = determineRoute(assessment.blended_risk_percent, policy);

  // Second pass to persist the correct route
  const final = await repo.computeAndStoreRisk(quotationVersionId, route, policy);

  return {
    blended_risk_percent: final.assessment.blended_risk_percent,
    route,
    lines: final.lines,
    assessed_at: final.assessment.assessed_at,
  };
}

export async function getRiskForQuotation(quotationId) {
  const assessment = await repo.getRiskByQuotationId(quotationId);
  if (!assessment) throw new NotFoundError('Risk assessment');
  return assessment;
}
