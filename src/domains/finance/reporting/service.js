/**
 * Finance reporting service — revenue + outstanding/aging reports.
 * Read-only over committed data.
 */

import { pool } from '../../../infrastructure/database/pool.js';
import { Errors } from '../../../shared/errors.js';
import { subtract } from '../../../shared/money.js';
import {
  REVENUE_STATUSES,
  OPEN_INVOICE_STATUSES,
  summarizeRevenueRows,
  bucketOutstandingRows,
  daysBetweenIso
} from './rules.js';
import * as repo from './repository.js';

export async function revenueReport({ from, to, ownerUserId, status } = {}) {
  validateWindow({ from, to });
  if (status && !REVENUE_STATUSES.has(status)) {
    throw Errors.validation(`status must be one of: ${[...REVENUE_STATUSES].join(', ')}`);
  }

  const fromDate = from ? toDateOnly(from) : null;
  const toDate = to ? toDateOnly(to) : null;

  const rows = await repo.selectRevenue(pool, {
    fromDate,
    toDate,
    ownerUserId: ownerUserId ?? null,
    status: status ?? null
  });

  return {
    filters: { from: from ?? null, to: to ?? null, ownerUserId: ownerUserId ?? null, status: status ?? null },
    rows,
    totals: summarizeRevenueRows(rows)
  };
}

export async function outstandingReport({ asOf, ownerUserId } = {}) {
  const asOfIso = asOf ? new Date(asOf).toISOString() : new Date().toISOString();
  const rows = await repo.selectOutstandingInvoices(pool, { ownerUserId: ownerUserId ?? null });

  const openRows = rows.filter((r) => OPEN_INVOICE_STATUSES.has(r.status));
  const buckets = bucketOutstandingRows(openRows, { asOfIso });
  const detailed = openRows.map((r) => ({
    ...r,
    ageDays: daysBetweenIso(r.invoiceDate, asOfIso),
    outstanding: subtract(r.amountDue, r.amountPaid)
  }));

  return { asOf: asOfIso, buckets, rows: detailed };
}

function validateWindow({ from, to }) {
  if (from && Number.isNaN(new Date(from).getTime())) {
    throw Errors.validation('from must be an ISO date');
  }
  if (to && Number.isNaN(new Date(to).getTime())) {
    throw Errors.validation('to must be an ISO date');
  }
  if (from && to && new Date(from).getTime() > new Date(to).getTime()) {
    throw Errors.validation('from must not be after to');
  }
}

function toDateOnly(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}
