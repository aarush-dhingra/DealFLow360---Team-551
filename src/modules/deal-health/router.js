import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import * as svc from './service.js';

export const dealHealthRouter = Router();

const managerRoles = ['admin', 'sales_manager', 'finance_operations'];

dealHealthRouter.get('/dashboard', requireAuth, requireRole(...managerRoles), async (_req, res, next) => {
  try {
    const dashboard = await svc.getDealHealthDashboard();
    res.json(dashboard);
  } catch (err) { next(err); }
});

dealHealthRouter.post('/quotations/:quotationId/assess', requireAuth, requireRole(...managerRoles), async (req, res, next) => {
  try {
    const result = await svc.assessDealHealth(req.params.quotationId);
    res.json({ health: result });
  } catch (err) { next(err); }
});

dealHealthRouter.post('/quotations/:quotationId/nudge', requireAuth, requireRole(...managerRoles), async (req, res, next) => {
  try {
    const result = await svc.nudgeRep(req.params.quotationId, req.user.id);
    res.json(result);
  } catch (err) { next(err); }
});
