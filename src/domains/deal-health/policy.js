export function computeBand(score, policy) {
  const s = parseFloat(score);
  const finance = parseFloat(policy.finance_threshold);
  const manager = parseFloat(policy.manager_threshold);
  const warning = parseFloat(policy.warning_threshold);

  if (s >= finance) return 'finance';
  if (s >= manager) return 'manager';
  if (s >= warning) return 'warning';
  return 'normal';
}
