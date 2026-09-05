// Money arithmetic helpers — all actual calculations happen in PostgreSQL
// using NUMERIC(19,4) to avoid floating point errors. These utilities are
// for safe display formatting only.

export function formatCurrency(amount, currencyCode = 'INR') {
  const num = parseFloat(amount);
  if (Number.isNaN(num)) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(num);
}

export function toDisplayPercent(numericStr, decimals = 2) {
  const num = parseFloat(numericStr);
  if (Number.isNaN(num)) return '—';
  return `${num.toFixed(decimals)}%`;
}
