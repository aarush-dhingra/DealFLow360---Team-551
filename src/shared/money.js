/**
 * Exact decimal arithmetic for money and percentages.
 *
 * The platform stores NUMERIC values and forbids JavaScript float arithmetic
 * for money/percentages. These helpers operate on decimal strings using
 * integer-scaled bigint math, so results are exact at 4 decimal places.
 */

const SCALE = 4;
const SCALE_FACTOR = 10n ** BigInt(SCALE);

function toScaled(value) {
  const raw = String(value ?? '').trim();
  if (!/^-?\d+(\.\d+)?$/.test(raw)) {
    throw new TypeError(`Invalid numeric value: "${value}"`);
  }
  const sign = raw.startsWith('-') ? -1n : 1n;
  const unsigned = raw.startsWith('-') ? raw.slice(1) : raw;
  const [intPart = '0', fracPart = ''] = unsigned.split('.');
  const frac = (fracPart + '0000').slice(0, SCALE);
  return sign * (BigInt(intPart) * SCALE_FACTOR + BigInt(frac));
}

function fromScaled(scaled) {
  const sign = scaled < 0n ? '-' : '';
  const abs = scaled < 0n ? -scaled : scaled;
  const intPart = abs / SCALE_FACTOR;
  const frac = (abs % SCALE_FACTOR).toString().padStart(SCALE, '0');
  return `${sign}${intPart}.${frac}`;
}

export function add(a, b) {
  return fromScaled(toScaled(a) + toScaled(b));
}

export function subtract(a, b) {
  return fromScaled(toScaled(a) - toScaled(b));
}

export function multiply(a, b) {
  const product = toScaled(a) * toScaled(b);
  const half = SCALE_FACTOR / 2n;
  const rounded = product >= 0n ? (product + half) / SCALE_FACTOR : (product - half) / SCALE_FACTOR;
  return fromScaled(rounded);
}

export function divide(a, b) {
  const divisor = toScaled(b);
  if (divisor === 0n) throw new Error('Division by zero');
  const scaledA = toScaled(a) * SCALE_FACTOR;
  const half = divisor >= 0n ? divisor / 2n : -divisor / 2n;
  const quotient = scaledA >= 0n ? (scaledA + half) / divisor : (scaledA - half) / divisor;
  return fromScaled(quotient);
}

export function compare(a, b) {
  const diff = toScaled(a) - toScaled(b);
  return diff < 0n ? -1 : diff > 0n ? 1 : 0;
}

export function gt(a, b) {
  return compare(a, b) > 0;
}

export function gte(a, b) {
  return compare(a, b) >= 0;
}

export function lt(a, b) {
  return compare(a, b) < 0;
}

export function lte(a, b) {
  return compare(a, b) <= 0;
}

export function eq(a, b) {
  return compare(a, b) === 0;
}

export function max(a, b) {
  return gte(a, b) ? String(a) : String(b);
}

export function min(a, b) {
  return lte(a, b) ? String(a) : String(b);
}
