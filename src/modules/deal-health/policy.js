/**
 * Deal health score formula (from MASTER_CONTEXT):
 *
 *   score = min(50, turns * turn_points)
 *         + min(30, age_days * age_day_points)
 *         + min(20, inactivity_days * inactivity_day_points)
 *
 * Score is 0–100. Higher = more at risk.
 * Inactivity resets on any response; age and turns accumulate permanently.
 */
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
