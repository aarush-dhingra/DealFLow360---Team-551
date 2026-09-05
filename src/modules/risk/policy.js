/**
 * Computes blended discount risk for a set of quote lines.
 *
 * All arithmetic is performed in the database using NUMERIC types.
 * This function accepts pre-computed line values from the DB and determines
 * the approval route based on the active policy.
 *
 * Formula (from MASTER_CONTEXT):
 *   line_overage_percent  = max(0, requested - allowed)
 *   line_excess_value     = line_base_value * line_overage_percent / 100
 *   blended_risk_percent  = (sum(line_excess_value) / total_pre_discount_order_value) * 100
 */

export function determineRoute(blendedRiskPercent, policy) {
  const risk = parseFloat(blendedRiskPercent);

  if (risk <= 0) return 'none';

  const managerMax = parseFloat(policy.manager_max_blended_risk_percent);

  if (risk <= managerMax) return 'manager';

  return policy.high_risk_route === 'finance_direct'
    ? 'finance_direct'
    : 'manager_then_finance';
}
