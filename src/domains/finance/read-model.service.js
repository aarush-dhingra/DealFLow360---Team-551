import { pool } from '../../infrastructure/database/pool.js';
import * as repository from './read-model.repository.js';

export async function getFulfillmentOrders(filters) {
  const [orders, count] = await Promise.all([
    repository.listFulfillmentOrders(pool, filters),
    repository.countFulfillmentOrders(pool)
  ]);
  return { orders, count };
}

export async function getInvoices(filters) {
  const [invoices, count] = await Promise.all([
    repository.listInvoices(pool, filters),
    repository.countInvoices(pool, filters)
  ]);
  return { invoices, count };
}

export async function getInvoiceDetail(invoiceId) {
  const invoice = await repository.findInvoiceDetail(pool, invoiceId);
  if (!invoice) return null;
  const [payments, creditNotes] = await Promise.all([
    repository.findInvoicePayments(pool, invoiceId),
    repository.findInvoiceCreditNotes(pool, invoiceId)
  ]);
  return { ...invoice, payments, creditNotes };
}

export async function getReportSummary(filters) {
  return repository.reportSummary(pool, filters);
}
