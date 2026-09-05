import Decimal from 'decimal.js';

export function determineRoute(blendedRiskPercent, policy) {
  const risk = new Decimal(blendedRiskPercent);

  if (risk.lte(0)) return 'none';

  const managerMax = new Decimal(policy.manager_max_blended_risk_percent);

  if (risk.lte(managerMax)) return 'manager';

  return policy.high_risk_route === 'finance_direct'
    ? 'finance_direct'
    : 'manager_then_finance';
}
