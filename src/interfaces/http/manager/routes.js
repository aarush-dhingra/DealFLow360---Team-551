import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';
import { requireAuthentication, requireRole as requireCurrentRole } from '../../../modules/identity/auth.middleware.js';
import { validate as validateCurrent } from '../../../shared/http.js';
import { validate } from '../../../shared/http/validate.js';
import {
  approvalActionSchema,
  updateTierSchema,
  updateCategorySchema,
  updateApprovalPolicySchema,
} from './schemas.js';

import * as quotationsSvc from '../../../domains/quotations/service.js';
import * as riskSvc from '../../../domains/risk/service.js';
import * as approvalsSvc from '../../../domains/approvals/service.js';
import * as dealHealthSvc from '../../../domains/deal-health/service.js';
import * as tiersRepo from '../../../domains/customers/repository.js';
import * as catalogueRepo from '../../../domains/catalogue/repository.js';
import * as approvalsRepo from '../../../domains/approvals/repository.js';
import * as dealHealthRepo from '../../../domains/deal-health/repository.js';
import { NotFoundError } from '../../../shared/http/errors.js';
import { getFulfillmentOrder, previewFulfillmentPlan } from '../../../domains/finance/fulfillment/service.js';
import { fulfillmentOrderIdParams, quoteIdParams } from '../fulfillment.schemas.js';

export const managerRouter = Router();

const internal = ['admin', 'sales_manager', 'finance_operations'];
const managers = ['admin'];
const reviewers = ['admin', 'sales_manager', 'finance_operations'];

// Managers monitor the warehouse plan and result but cannot alter allocations;
// accepting or manually overriding a split is reserved for Finance/Operations.
managerRouter.get('/fulfillment/quotes/:quoteId/suggestion', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(quoteIdParams, 'params'), async (req, res, next) => {
  try { res.json({ data: await previewFulfillmentPlan({ quotationId: req.validated.params.quoteId }) }); } catch (err) { next(err); }
});
managerRouter.get('/fulfillment/orders/:fulfillmentOrderId', requireAuthentication, requireCurrentRole('sales_manager', 'finance_operations', 'admin'), validateCurrent(fulfillmentOrderIdParams, 'params'), async (req, res, next) => {
  try { res.json({ data: await getFulfillmentOrder({ fulfillmentOrderId: req.validated.params.fulfillmentOrderId }) }); } catch (err) { next(err); }
});

// ─── Config: tiers ───────────────────────────────────────────────────────────

managerRouter.get('/config/tiers', requireAuth, requireRole(...reviewers), async (_req, res, next) => {
  try {
    res.json({ tiers: await tiersRepo.getTiers() });
  } catch (err) { next(err); }
});

managerRouter.patch('/config/tiers/:code', requireAuth, requireRole(...managers), async (req, res, next) => {
  try {
    const data = validate(updateTierSchema, req.body);
    const updated = await tiersRepo.updateTierEntitlement(
      req.params.code, data.entitlement_discount_percent, req.user.id
    );
    if (!updated) throw new NotFoundError('Customer tier');
    res.json({ tier: updated });
  } catch (err) { next(err); }
});

// ─── Config: categories ───────────────────────────────────────────────────────

managerRouter.get('/config/categories', requireAuth, requireRole(...reviewers), async (_req, res, next) => {
  try {
    res.json({ categories: await catalogueRepo.getCategories() });
  } catch (err) { next(err); }
});

managerRouter.patch('/config/categories/:code', requireAuth, requireRole(...managers), async (req, res, next) => {
  try {
    const data = validate(updateCategorySchema, req.body);
    const updated = await catalogueRepo.updateCategoryCeiling(
      req.params.code, data.discount_ceiling_percent, req.user.id
    );
    if (!updated) throw new NotFoundError('Product category');
    res.json({ category: updated });
  } catch (err) { next(err); }
});

// ─── Config: approval policy ──────────────────────────────────────────────────

managerRouter.get('/config/approval-policy', requireAuth, requireRole(...reviewers), async (_req, res, next) => {
  try {
    res.json({ policy: await approvalsRepo.getActiveApprovalPolicy() });
  } catch (err) { next(err); }
});

managerRouter.put('/config/approval-policy', requireAuth, requireRole(...managers), async (req, res, next) => {
  try {
    const data = validate(updateApprovalPolicySchema, req.body);
    const policy = await approvalsRepo.upsertApprovalPolicy(
      data.manager_max_blended_risk_percent,
      data.high_risk_route,
      req.user.id
    );
    res.status(201).json({ policy });
  } catch (err) { next(err); }
});

// ─── Config: deal health policy ───────────────────────────────────────────────

managerRouter.get('/config/deal-health-policy', requireAuth, requireRole(...reviewers), async (_req, res, next) => {
  try {
    res.json({ policy: await dealHealthRepo.getActiveDealHealthPolicy() });
  } catch (err) { next(err); }
});

// ─── Quotations ───────────────────────────────────────────────────────────────

managerRouter.get('/quotations', requireAuth, requireRole(...internal), async (req, res, next) => {
  try {
    const { status, owner_id, customer_id, limit, offset } = req.query;
    const quotes = await quotationsSvc.listQuotations({
      status,
      ownerId: owner_id,
      customerId: customer_id,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ quotations: quotes, count: quotes.length });
  } catch (err) { next(err); }
});

managerRouter.get('/quotations/:id', requireAuth, requireRole(...internal), async (req, res, next) => {
  try {
    res.json({ quotation: await quotationsSvc.getQuotation(req.params.id) });
  } catch (err) { next(err); }
});

managerRouter.get('/quotations/:id/versions/:versionNumber', requireAuth, requireRole(...internal), async (req, res, next) => {
  try {
    const version = await quotationsSvc.getQuotationVersion(
      req.params.id, Number(req.params.versionNumber)
    );
    res.json({ version });
  } catch (err) { next(err); }
});

managerRouter.get('/quotations/:id/audit', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    const events = await quotationsSvc.getQuotationAudit(req.params.id);
    res.json({ audit_events: events });
  } catch (err) { next(err); }
});

// ─── Risk ─────────────────────────────────────────────────────────────────────

managerRouter.get('/quotations/:quotationId/risk', requireAuth, requireRole(...internal), async (req, res, next) => {
  try {
    res.json({ risk: await riskSvc.getRiskForQuotation(req.params.quotationId) });
  } catch (err) { next(err); }
});

// ─── Approvals ────────────────────────────────────────────────────────────────

managerRouter.get('/approvals', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    const { required_role, status, limit, offset } = req.query;
    const approvals = await approvalsSvc.listApprovals({
      requiredRole: required_role,
      status,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ approvals, count: approvals.length });
  } catch (err) { next(err); }
});

managerRouter.get('/approvals/:id', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    res.json({ approval: await approvalsSvc.getApprovalDetail(req.params.id) });
  } catch (err) { next(err); }
});

managerRouter.post('/approvals/:id/approve', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.approveQuotation(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
});

managerRouter.post('/approvals/:id/reject', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.rejectQuotation(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
});

managerRouter.post('/approvals/:id/return', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.returnForRevision(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
});

managerRouter.post('/approvals/:id/escalate', requireAuth, requireRole(...managers), async (req, res, next) => {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.escalateToFinance(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
});

// ─── Deal health ──────────────────────────────────────────────────────────────

managerRouter.get('/deal-health/dashboard', requireAuth, requireRole(...reviewers), async (_req, res, next) => {
  try {
    res.json(await dealHealthSvc.getDealHealthDashboard());
  } catch (err) { next(err); }
});

managerRouter.post('/deal-health/quotations/:id/assess', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    res.json({ health: await dealHealthSvc.assessDealHealth(req.params.id) });
  } catch (err) { next(err); }
});

managerRouter.post('/deal-health/quotations/:id/nudge', requireAuth, requireRole(...reviewers), async (req, res, next) => {
  try {
    res.json(await dealHealthSvc.nudgeRep(req.params.id, req.user.id));
  } catch (err) { next(err); }
});
