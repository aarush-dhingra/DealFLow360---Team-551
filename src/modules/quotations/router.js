import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import * as svc from './service.js';

export const quotationsRouter = Router();

const internalRoles = ['admin', 'sales_manager', 'finance_operations', 'sales_rep'];

quotationsRouter.get('/', requireAuth, requireRole(...internalRoles), async (req, res, next) => {
  try {
    const { status, owner_id, customer_id, limit, offset } = req.query;
    const quotes = await svc.listQuotations({
      status,
      ownerId: owner_id,
      customerId: customer_id,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0,
    });
    res.json({ quotations: quotes, count: quotes.length });
  } catch (err) { next(err); }
});

quotationsRouter.get('/:id', requireAuth, requireRole(...internalRoles), async (req, res, next) => {
  try {
    const quote = await svc.getQuotation(req.params.id);
    res.json({ quotation: quote });
  } catch (err) { next(err); }
});

quotationsRouter.get('/:id/versions/:versionNumber', requireAuth, requireRole(...internalRoles), async (req, res, next) => {
  try {
    const version = await svc.getQuotationVersion(
      req.params.id,
      Number(req.params.versionNumber)
    );
    res.json({ version });
  } catch (err) { next(err); }
});

quotationsRouter.get('/:id/audit', requireAuth, requireRole('admin', 'sales_manager', 'finance_operations'), async (req, res, next) => {
  try {
    const events = await svc.getQuotationAudit(req.params.id);
    res.json({ audit_events: events });
  } catch (err) { next(err); }
});
