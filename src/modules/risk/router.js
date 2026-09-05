import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import * as svc from './service.js';

export const riskRouter = Router({ mergeParams: true });

const internalRoles = ['admin', 'sales_manager', 'finance_operations', 'sales_rep'];

riskRouter.get('/', requireAuth, requireRole(...internalRoles), async (req, res, next) => {
  try {
    const assessment = await svc.getRiskForQuotation(req.params.quotationId);
    res.json({ risk: assessment });
  } catch (err) { next(err); }
});
