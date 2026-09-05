/**
 * Finance HTTP router.
 *
 * All finance routes live under /api/v1/finance (mounted by the application
 * route file at the /finance prefix). Routes do NOT sit at the top-level
 * /api/v1 resource paths; they are finance-scoped.
 */

import { Router } from 'express';
import { requireFinance, errorHandler } from './middleware.js';
import { decideApprovalController } from './approval.controller.js';

export const financeRouter = Router();

financeRouter.post(
  '/quotations/:quotationId/approvals/:approvalInstanceId/decisions',
  requireFinance,
  decideApprovalController
);

// Keep the error envelope local to finance routes.
financeRouter.use(errorHandler);

export default financeRouter;
