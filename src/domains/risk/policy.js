import Decimal from 'decimal.js';

export function determineRoute(blendedRiskPercent, policy) {
  const risk = new Decimal(blendedRiskPercent);

  if (risk.lte(0)) return 'none';

  const managerMax = new Decimal(policy.manager_max_blended_risk_percent);

  if (risk.lte(managerMax)) return 'manager';

  // DealFlow360 uses a strict human escalation chain.  Finance never receives
  // a new quote before the manager has reviewed and approved it.
  return 'manager_then_finance';
}
