/**
 * Finance reporting rules (pure, no I/O).
 *
 * - Revenue rows are summed in exact money.
 * - Outstanding invoices are bucketed by age (0-30 / 31-60 / 61-90 / 90+).
 * - A small CSV serializer is provided for export.
 */

import { add, subtract, gt } from '../../../shared/money.js';

export const REVENUE_STATUSES = new Set([
  'issued',
  'partially_paid',
  'paid',
  'overdue',
  'credited',
  'void'
]);

export const OPEN_INVOICE_STATUSES = new Set(['issued', 'partially_paid', 'overdue']);

export const AGE_BUCKETS = Object.freeze([
  { label: '0-30', min: 0, max: 30 },
  { label: '31-60', min: 31, max: 60 },
  { label: '61-90', min: 61, max: 90 },
  { label: '90+', min: 91, max: Infinity }
]);

export function daysBetweenIso(startIso, endIso) {
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  const days = Math.floor(ms / 86_400_000);
  return Number.isFinite(days) && days > 0 ? days : 0;
}

export function bucketForAge(days) {
  return AGE_BUCKETS.find((b) => days >= b.min && days <= b.max)?.label ?? '90+';
}

/** Group open invoice rows into age buckets with exact outstanding sums. */
export function bucketOutstandingRows(rows, { asOfIso }) {
  const buckets = AGE_BUCKETS.map((b) => ({ bucket: b.label, invoiceCount: 0, outstandingTotal: '0' }));
  const byLabel = new Map(buckets.map((b) => [b.bucket, b]));

  for (const row of rows) {
    const age = daysBetweenIso(row.invoiceDate, asOfIso);
    const label = bucketForAge(age);
    const outstanding = subtract(row.amountDue, row.amountPaid);
    if (gt(outstanding, '0')) {
      const target = byLabel.get(label);
      target.invoiceCount += 1;
      target.outstandingTotal = add(target.outstandingTotal, outstanding);
    }
  }
  return buckets;
}

/** Totals across revenue rows (each may group many invoices). */
export function summarizeRevenueRows(rows) {
  let invoiceCount = 0;
  let amountDue = '0';
  let amountPaid = '0';
  for (const row of rows) {
    invoiceCount += Number(row.invoiceCount ?? 0);
    amountDue = add(amountDue, row.amountDue ?? '0');
    amountPaid = add(amountPaid, row.amountPaid ?? '0');
  }
  return { invoiceCount, amountDue, amountPaid, outstanding: subtract(amountDue, amountPaid) };
}

/** Minimal safe CSV serializer (quotes separators/quotes/newlines). */
export function toCsv(headers, rows, columns) {
  const escape = (value) => {
    const s = value == null ? '' : String(value);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = headers.map((h) => escape(h.label)).join(',');
  const body = rows.map((row) => columns.map((col) => escape(row[col.key])).join(','));
  return [header, ...body].join('\r\n');
}
