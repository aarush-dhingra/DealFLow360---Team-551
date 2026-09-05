import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { ValidationError } from '../../shared/errors.js';
import { actionSchema } from './schema.js';
import * as svc from './service.js';

export const approvalsRouter = Router();

const managerRoles = ['admin', 'sales_manager'];
const reviewerRoles = ['admin', 'sales_manager', 'finance_operations'];

approvalsRouter.get('/', requireAuth, requireRole(...reviewerRoles), async (req, res, next) => {
  try {
    const { required_role, status, limit, offset } = req.query;
    const approvals = await svc.listApprovals({
      requiredRole: required_role,
      status,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ approvals, count: approvals.length });
  } catch (err) { next(err); }
});

approvalsRouter.get('/:id', requireAuth, requireRole(...reviewerRoles), async (req, res, next) => {
  try {
    const approval = await svc.getApprovalDetail(req.params.id);
    res.json({ approval });
  } catch (err) { next(err); }
});

approvalsRouter.post('/:id/approve', requireAuth, requireRole(...reviewerRoles), async (req, res, next) => {
  try {
    const result = actionSchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const outcome = await svc.approveQuotation(req.params.id, req.user, result.data.reason);
    res.json(outcome);
  } catch (err) { next(err); }
});

approvalsRouter.post('/:id/reject', requireAuth, requireRole(...reviewerRoles), async (req, res, next) => {
  try {
    const result = actionSchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const outcome = await svc.rejectQuotation(req.params.id, req.user, result.data.reason);
    res.json(outcome);
  } catch (err) { next(err); }
});

approvalsRouter.post('/:id/return', requireAuth, requireRole(...reviewerRoles), async (req, res, next) => {
  try {
    const result = actionSchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const outcome = await svc.returnForRevision(req.params.id, req.user, result.data.reason);
    res.json(outcome);
  } catch (err) { next(err); }
});

approvalsRouter.post('/:id/escalate', requireAuth, requireRole(...managerRoles), async (req, res, next) => {
  try {
    const result = actionSchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const outcome = await svc.escalateToFinance(req.params.id, req.user, result.data.reason);
    res.json(outcome);
  } catch (err) { next(err); }
});
