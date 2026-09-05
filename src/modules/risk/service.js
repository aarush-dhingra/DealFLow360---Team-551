import { NotFoundError, AppError } from '../../shared/errors.js';
import { determineRoute } from './policy.js';
import * as repo from './repository.js';
import { getActiveApprovalPolicy } from '../configuration/repository.js';

/**
 * Computes and persists a risk assessment for a given quote version.
 * Called by the quotation submission flow (Sales Rep module).
 * Returns the assessment with per-line breakdown and the approval route.
 */
export async function assessQuoteVersion(quotationVersionId) {
  const policy = await getActiveApprovalPolicy();
  if (!policy) throw new AppError('No active approval policy configured', 500);

  const { assessment, lines } = await repo.computeAndStoreRisk(
    quotationVersionId,
    'none',
    policy
  );

  const route = determineRoute(assessment.blended_risk_percent, policy);

  // Re-store with correct route (update in place after route is known)
  const final = await repo.computeAndStoreRisk(quotationVersionId, route, policy);

  return {
    blended_risk_percent: final.assessment.blended_risk_percent,
    route,
    lines: final.lines,
    assessed_at: final.assessment.assessed_at,
  };
}

/**
 * Reads the stored risk assessment for the current version of a quotation.
 */
export async function getRiskForQuotation(quotationId) {
  const assessment = await repo.getRiskByQuotationId(quotationId);
  if (!assessment) throw new NotFoundError('Risk assessment');
  return assessment;
}
