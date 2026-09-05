import Decimal from 'decimal.js';

export function computeBand(score, policy) {
  const s = new Decimal(score);
  const finance = new Decimal(policy.finance_threshold);
  const manager = new Decimal(policy.manager_threshold);
  const warning = new Decimal(policy.warning_threshold);

  if (s.gte(finance)) return 'finance';
  if (s.gte(manager)) return 'manager';
  if (s.gte(warning)) return 'warning';
  return 'normal';
}
