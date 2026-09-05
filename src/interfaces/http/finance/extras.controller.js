/**
 * Finance reconciliation + deal-health + reporting HTTP controllers (thin).
 */

import { reconcileInvoiceById } from '../../../domains/finance/reconciliation/service.js';
import { listFinanceQueue, actOnAssessment } from '../../../domains/finance/deal-health/service.js';
import { revenueReport, outstandingReport } from '../../../domains/finance/reporting/service.js';
import { toCsv } from '../../../domains/finance/reporting/rules.js';
import { asyncHandler } from './middleware.js';
import {
  parse,
  invoiceParams,
  healthAssessmentParams,
  healthActionBody,
  financeQueueQuery,
  revenueReportQuery,
  outstandingReportQuery
} from './schemas.js';

export const reconciliationController = asyncHandler(async (req, res) => {
  const params = parse(invoiceParams, req.params);
  const result = await reconcileInvoiceById({ invoiceId: params.invoiceId });
  res.status(200).json({ data: result });
});

export const financeQueueController = asyncHandler(async (req, res) => {
  const query = parse(financeQueueQuery, req.query);
  const data = await listFinanceQueue({ limit: query.limit });
  res.status(200).json({ data });
});

export const healthActionController = asyncHandler(async (req, res) => {
  const params = parse(healthAssessmentParams, req.params);
  const body = parse(healthActionBody, req.body);

  const result = await actOnAssessment({
    assessmentId: params.assessmentId,
    action: body.action,
    reason: body.reason,
    principal: req.principal
  });
  res.status(200).json({ data: result });
});

export const revenueReportController = asyncHandler(async (req, res) => {
  const query = parse(revenueReportQuery, req.query);
  const report = await revenueReport(query);

  if (query.format === 'csv') {
    const csv = toCsv(
      [
        { key: 'invoiceDate', label: 'Invoice date' },
        { key: 'invoiceCount', label: 'Invoices' },
        { key: 'amountDue', label: 'Amount due' },
        { key: 'amountPaid', label: 'Amount paid' }
      ],
      report.rows,
      [
        { key: 'invoiceDate', label: 'Invoice date' },
        { key: 'invoiceCount', label: 'Invoices' },
        { key: 'amountDue', label: 'Amount due' },
        { key: 'amountPaid', label: 'Amount paid' }
      ]
    );
    return res
      .status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', 'attachment; filename="revenue.csv"')
      .send(csv);
  }

  res.status(200).json(report);
});

export const outstandingReportController = asyncHandler(async (req, res) => {
  const query = parse(outstandingReportQuery, req.query);
  const report = await outstandingReport(query);

  if (query.format === 'csv') {
    const columns = [
      { key: 'invoiceNumber', label: 'Invoice' },
      { key: 'customerName', label: 'Customer' },
      { key: 'invoiceDate', label: 'Invoice date' },
      { key: 'status', label: 'Status' },
      { key: 'amountDue', label: 'Amount due' },
      { key: 'amountPaid', label: 'Amount paid' },
      { key: 'outstanding', label: 'Outstanding' },
      { key: 'ageDays', label: 'Age days' }
    ];
    const csv = toCsv(columns, report.rows, columns);
    return res
      .status(200)
      .set('Content-Type', 'text/csv')
      .set('Content-Disposition', 'attachment; filename="outstanding.csv"')
      .send(csv);
  }

  res.status(200).json(report);
});
