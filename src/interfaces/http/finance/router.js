/**
 * Finance HTTP router.
 *
 * All finance routes live under /api/v1/finance (mounted by the application
 * route file at the /finance prefix). Routes do NOT sit at the top-level
 * /api/v1 resource paths; they are finance-scoped.
 */

import { Router } from 'express';
import { requireFinance, requireFinanceOrManager, errorHandler } from './middleware.js';
import { decideApprovalController } from './approval.controller.js';
import {
  previewPlanController,
  allocateFulfillmentController,
  consolidateBackordersController
} from './fulfillment.controller.js';
import { applyPaymentController, voidInvoiceController } from './payments.controller.js';
import {
  issueCreditNoteController,
  applyCreditNoteController
} from './credit-notes.controller.js';
import {
  cancelSubscriptionController,
  changeQuantityController
} from './subscriptions.controller.js';
import {
  reconciliationController,
  financeQueueController,
  healthActionController,
  revenueReportController,
  outstandingReportController
} from './extras.controller.js';

export const financeRouter = Router();

financeRouter.post(
  '/quotations/:quotationId/approvals/:approvalInstanceId/decisions',
  requireFinance,
  decideApprovalController
);

// Manager may view fulfillment (GET) but not allocate; Finance allocates.
financeRouter.get(
  '/fulfillment/quotations/:quotationId/plan',
  requireFinanceOrManager,
  previewPlanController
);

financeRouter.post(
  '/fulfillment/quotations/:quotationId/allocate',
  requireFinance,
  allocateFulfillmentController
);

financeRouter.post(
  '/fulfillment/quotations/:quotationId/consolidate-backorders',
  requireFinance,
  consolidateBackordersController
);

// Finance records payments and voids unpaid invoices.
financeRouter.post(
  '/invoices/:invoiceId/payments',
  requireFinance,
  applyPaymentController
);

financeRouter.post(
  '/invoices/:invoiceId/void',
  requireFinance,
  voidInvoiceController
);

// Finance issues and applies credit notes against invoices.
financeRouter.post(
  '/invoices/:invoiceId/credit-notes',
  requireFinance,
  issueCreditNoteController
);

financeRouter.post(
  '/credit-notes/:creditNoteId/apply',
  requireFinance,
  applyCreditNoteController
);

// F5 — Subscription lifecycle (cancel, mid-cycle quantity change with proration).
financeRouter.post(
  '/subscriptions/:subscriptionId/cancel',
  requireFinance,
  cancelSubscriptionController
);

financeRouter.post(
  '/subscriptions/:subscriptionId/change-quantity',
  requireFinance,
  changeQuantityController
);

// F6 — One-time vs recurring reconciliation of an invoice (read-only).
financeRouter.get(
  '/invoices/:invoiceId/reconciliation',
  requireFinance,
  reconciliationController
);

// F7 — Finance deal-health queue and handling actions.
financeRouter.get(
  '/deal-health/finance-queue',
  requireFinance,
  financeQueueController
);

financeRouter.post(
  '/deal-health/:assessmentId/actions',
  requireFinance,
  healthActionController
);

// Reporting — revenue and outstanding/aging reports (read-only).
financeRouter.get(
  '/reports/revenue',
  requireFinance,
  revenueReportController
);

financeRouter.get(
  '/reports/outstanding',
  requireFinance,
  outstandingReportController
);

// Keep the error envelope local to finance routes.
financeRouter.use(errorHandler);

export default financeRouter;
