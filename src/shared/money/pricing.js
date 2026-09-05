// Pricing rule helpers — boundary checks only.
// Line-level and order-level totals are computed in PostgreSQL.

export function clampPercent(value) {
  const n = parseFloat(value);
  if (Number.isNaN(n)) throw new Error('Invalid percentage value');
  return Math.min(100, Math.max(0, n));
}

export function allowedDiscount(tierEntitlement, categoryCeiling) {
  // Effective allowed = min(tier entitlement, category ceiling)
  return Math.min(parseFloat(tierEntitlement), parseFloat(categoryCeiling));
}
