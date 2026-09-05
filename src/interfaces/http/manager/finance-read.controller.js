import { AppError } from '../../../shared/http.js';
import {
  getFulfillmentOrder,
  previewFulfillmentPlan
} from '../../../domains/finance/fulfillment/service.js';
import {
  getFulfillmentOrders,
  getInvoiceDetail,
  getInvoices,
  getReportSummary
} from '../../../domains/finance/read-model.service.js';

export async function previewFulfillment(req, res, next) {
  try {
    res.json({ data: await previewFulfillmentPlan({ quotationId: req.validated.params.quoteId }) });
  } catch (err) { next(err); }
}

export async function getFulfillment(req, res, next) {
  try {
    res.json({ data: await getFulfillmentOrder({ fulfillmentOrderId: req.validated.params.fulfillmentOrderId }) });
  } catch (err) { next(err); }
}

export async function listFulfillmentOrders(req, res, next) {
  try {
    res.json({ data: await getFulfillmentOrders({ limit: req.validated.query.limit ?? 50, offset: req.validated.query.offset ?? 0 }) });
  } catch (err) { next(err); }
}

export async function listInvoices(req, res, next) {
  try {
    res.json({ data: await getInvoices({ limit: req.validated.query.limit ?? 50, offset: req.validated.query.offset ?? 0, status: req.validated.query.status }) });
  } catch (err) { next(err); }
}

export async function getInvoice(req, res, next) {
  try {
    const invoice = await getInvoiceDetail(req.validated.params.invoiceId);
    if (!invoice) throw new AppError(404, 'INVOICE_NOT_FOUND', 'Invoice was not found.');
    res.json({ data: invoice });
  } catch (err) { next(err); }
}

export async function getReports(req, res, next) {
  try {
    res.json({ data: await getReportSummary(req.validated.query) });
  } catch (err) { next(err); }
}
