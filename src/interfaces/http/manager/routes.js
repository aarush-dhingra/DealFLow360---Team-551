import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';
import { requireAuthentication, requireRole as requireCurrentRole } from '../../../modules/identity/auth.middleware.js';
import { validate as validateCurrent } from '../../../shared/http.js';
import {
  invoiceIdParams,
  invoiceListQuerySchema,
  listQuerySchema,
  reportQuerySchema
} from './schemas.js';
import { fulfillmentOrderIdParams, quoteIdParams } from '../fulfillment.schemas.js';
import * as configController from './config.controller.js';
import * as quotationController from './quotations.controller.js';
import * as approvalController from './approvals.controller.js';
import * as dealHealthController from './deal-health.controller.js';
import * as financeReadController from './finance-read.controller.js';

export const managerRouter = Router();

const internal = ['admin', 'sales_manager', 'finance_operations'];
const managers = ['admin'];
const reviewers = ['admin', 'sales_manager', 'finance_operations'];

// Managers monitor the warehouse plan and result but cannot alter allocations;
// accepting or manually overriding a split is reserved for Finance/Operations.
managerRouter.get('/fulfillment/quotes/:quoteId/suggestion', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(quoteIdParams, 'params'), financeReadController.previewFulfillment);
managerRouter.get('/fulfillment/orders/:fulfillmentOrderId', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(fulfillmentOrderIdParams, 'params'), financeReadController.getFulfillment);
managerRouter.get('/fulfillment/orders', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(listQuerySchema, 'query'), financeReadController.listFulfillmentOrders);

// Read-only financial views for the internal workspace. Finance mutations remain
// under /finance, while Managers can safely render list/detail screens.
managerRouter.get('/invoices', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(invoiceListQuerySchema, 'query'), financeReadController.listInvoices);
managerRouter.get('/invoices/:invoiceId', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(invoiceIdParams, 'params'), financeReadController.getInvoice);
managerRouter.get('/reports', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(reportQuerySchema, 'query'), financeReadController.getReports);

// ─── Config: tiers ───────────────────────────────────────────────────────────

managerRouter.get('/config/tiers', requireAuth, requireRole(...reviewers), configController.listTiers);
managerRouter.patch('/config/tiers/:code', requireAuth, requireRole(...managers), configController.updateTier);

// ─── Config: categories ───────────────────────────────────────────────────────

managerRouter.get('/config/categories', requireAuth, requireRole(...reviewers), configController.listCategories);
managerRouter.patch('/config/categories/:code', requireAuth, requireRole(...managers), configController.updateCategory);

// ─── Config: approval policy ──────────────────────────────────────────────────

managerRouter.get('/config/approval-policy', requireAuth, requireRole(...reviewers), configController.getApprovalPolicy);
managerRouter.put('/config/approval-policy', requireAuth, requireRole(...managers), configController.updateApprovalPolicy);

// ─── Config: deal health policy ───────────────────────────────────────────────

managerRouter.get('/config/deal-health-policy', requireAuth, requireRole(...reviewers), configController.getDealHealthPolicy);
managerRouter.get('/subscription-plans', requireAuth, requireRole(...reviewers), configController.listSubscriptionPlans);
managerRouter.get('/subscription-plans/:id', requireAuth, requireRole(...reviewers), configController.getSubscriptionPlan);

// ─── Quotations ───────────────────────────────────────────────────────────────

managerRouter.get('/quotations', requireAuth, requireRole(...internal), quotationController.listQuotations);
managerRouter.get('/quotations/:id', requireAuth, requireRole(...internal), quotationController.getQuotation);
managerRouter.get('/quotations/:id/versions/:versionNumber', requireAuth, requireRole(...internal), quotationController.getQuotationVersion);
managerRouter.get('/quotations/:id/audit', requireAuth, requireRole(...reviewers), quotationController.getQuotationAudit);

// ─── Risk ─────────────────────────────────────────────────────────────────────

managerRouter.get('/quotations/:quotationId/risk', requireAuth, requireRole(...internal), quotationController.getQuotationRisk);

// ─── Approvals ────────────────────────────────────────────────────────────────

managerRouter.get('/approvals', requireAuth, requireRole(...reviewers), approvalController.listApprovals);
managerRouter.get('/approvals/:id', requireAuth, requireRole(...reviewers), approvalController.getApproval);
managerRouter.post('/approvals/:id/approve', requireAuth, requireRole(...reviewers), approvalController.approveQuotation);
managerRouter.post('/approvals/:id/reject', requireAuth, requireRole(...reviewers), approvalController.rejectQuotation);
managerRouter.post('/approvals/:id/return', requireAuth, requireRole(...reviewers), approvalController.returnForRevision);
managerRouter.post('/approvals/:id/escalate', requireAuth, requireRole(...managers), approvalController.escalateToFinance);

// ─── Deal health ──────────────────────────────────────────────────────────────

managerRouter.get('/deal-health/dashboard', requireAuth, requireRole(...reviewers), dealHealthController.getDashboard);
managerRouter.post('/deal-health/quotations/:id/assess', requireAuth, requireRole(...reviewers), dealHealthController.assessQuotation);
managerRouter.post('/deal-health/quotations/:id/nudge', requireAuth, requireRole(...reviewers), dealHealthController.nudgeSalesRep);
