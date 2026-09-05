import test from 'node:test';
import assert from 'node:assert/strict';

import {
  REVENUE_STATUSES,
  OPEN_INVOICE_STATUSES,
  daysBetweenIso,
  bucketForAge,
  bucketOutstandingRows,
  summarizeRevenueRows,
  toCsv
} from '../src/domains/finance/reporting/rules.js';

test('reporting: day diff is whole days, never negative', () => {
  assert.equal(daysBetweenIso('2025-01-01T00:00:00.000Z', '2025-01-10T00:00:00.000Z'), 9);
  assert.equal(daysBetweenIso('2025-01-10T00:00:00.000Z', '2025-01-01T00:00:00.000Z'), 0);
});

test('reporting: aging buckets cover all ranges', () => {
  assert.equal(bucketForAge(0), '0-30');
  assert.equal(bucketForAge(30), '0-30');
  assert.equal(bucketForAge(31), '31-60');
  assert.equal(bucketForAge(90), '61-90');
  assert.equal(bucketForAge(91), '90+');
  assert.equal(bucketForAge(400), '90+');
});

test('reporting: bucketOutstandingRows groups with exact totals', () => {
  const rows = [
    { invoiceDate: '2025-01-01', amountDue: '100.0000', amountPaid: '40.0000' }, // old -> 90+
    { invoiceDate: '2025-04-15', amountDue: '50.0000', amountPaid: '0' }, // recent -> 0-30
    { invoiceDate: '2025-04-01', amountDue: '20.0000', amountPaid: '20.0000' } // paid -> excluded
  ];
  const buckets = bucketOutstandingRows(rows, { asOfIso: '2025-04-20T00:00:00.000Z' });
  const byLabel = new Map(buckets.map((b) => [b.bucket, b]));
  assert.equal(byLabel.get('0-30').invoiceCount, 1);
  assert.equal(byLabel.get('0-30').outstandingTotal, '50.0000');
  assert.equal(byLabel.get('90+').invoiceCount, 1);
  assert.equal(byLabel.get('90+').outstandingTotal, '60.0000');
});

test('reporting: summarizeRevenueRows sums exactly', () => {
  const totals = summarizeRevenueRows([
    { invoiceCount: 2, amountDue: '100.10', amountPaid: '40.05' },
    { invoiceCount: 1, amountDue: '0.90', amountPaid: '0.95' }
  ]);
  assert.equal(totals.invoiceCount, 3);
  assert.equal(totals.amountDue, '101.0000');
  assert.equal(totals.amountPaid, '41.0000');
  assert.equal(totals.outstanding, '60.0000');
});

test('reporting: toCsv quotes separators and quotes', () => {
  const csv = toCsv(
    [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }],
    [{ name: 'Acme, Inc', note: 'say "hi"' }],
    [{ key: 'name', label: 'Name' }, { key: 'note', label: 'Note' }]
  );
  assert.equal(csv, 'Name,Note\r\n"Acme, Inc","say ""hi"""');
});

test('reporting: status sets are fixed', () => {
  assert.deepEqual([...REVENUE_STATUSES].sort(), ['credited', 'issued', 'overdue', 'paid', 'partially_paid', 'void']);
  for (const s of OPEN_INVOICE_STATUSES) assert.ok(REVENUE_STATUSES.has(s));
});
