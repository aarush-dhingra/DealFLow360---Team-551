export function determineRoute(blendedRiskPercent, policy) {
  const risk = parseFloat(blendedRiskPercent);

  if (risk <= 0) return 'none';

  const managerMax = parseFloat(policy.manager_max_blended_risk_percent);

  if (risk <= managerMax) return 'manager';

  return policy.high_risk_route === 'finance_direct'
    ? 'finance_direct'
    : 'manager_then_finance';
}
