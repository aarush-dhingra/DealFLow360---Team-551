/**
 * Finance HTTP router.
 *
 * All finance routes live under /api/v1/finance (mounted by the application
 * route file at the /finance prefix). Routes do NOT sit at the top-level
 * /api/v1 resource paths; they are finance-scoped.
 */

import { Router } from 'express';
import { requireAuthentication } from '../../../modules/identity/auth.middleware.js';
import { requireFinance, requireFinanceOrManager, errorHandler } from './middleware.js';
import { decideApprovalController } from './approval.controller.js';
import {
  previewPlanController,
  fulfillmentQueueController,
  allocateFulfillmentController,
  shipFulfillmentController,
  consolidateBackordersController
} from './fulfillment.controller.js';
import { applyPaymentController, voidInvoiceController } from './payments.controller.js';
import {
  issueCreditNoteController,
  applyCreditNoteController
} from './credit-notes.controller.js';

export const financeRouter = Router();

financeRouter.use(requireAuthentication);

financeRouter.post(
  '/quotations/:quotationId/approvals/:approvalInstanceId/decisions',
  requireFinance,
  decideApprovalController
);

// Manager may view fulfillment (GET) but not allocate; Finance allocates.
financeRouter.get(
  '/fulfillment/queue',
  requireFinanceOrManager,
  fulfillmentQueueController
);

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

financeRouter.post(
  '/fulfillment/quotations/:quotationId/ship',
  requireFinance,
  shipFulfillmentController
);

// Keep the error envelope local to finance routes.
financeRouter.use(errorHandler);

export default financeRouter;
