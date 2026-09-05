import { Router } from 'express';
import { requireAuth, requireRole } from '../../shared/middleware/auth.js';
import { ValidationError } from '../../shared/errors.js';
import { updateTierSchema, updateCategorySchema, updateApprovalPolicySchema } from './schema.js';
import * as svc from './service.js';

export const configurationRouter = Router();

const canManageConfig = [requireAuth, requireRole('admin', 'sales_manager')];

configurationRouter.get('/tiers', requireAuth, requireRole('admin', 'sales_manager', 'finance_operations'), async (_req, res, next) => {
  try {
    const tiers = await svc.listTiers();
    res.json({ tiers });
  } catch (err) { next(err); }
});

configurationRouter.patch('/tiers/:code', ...canManageConfig, async (req, res, next) => {
  try {
    const result = updateTierSchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const updated = await svc.setTierEntitlement(
      req.params.code,
      result.data.entitlement_discount_percent,
      req.user.id
    );
    res.json({ tier: updated });
  } catch (err) { next(err); }
});

configurationRouter.get('/categories', requireAuth, requireRole('admin', 'sales_manager', 'finance_operations'), async (_req, res, next) => {
  try {
    const categories = await svc.listCategories();
    res.json({ categories });
  } catch (err) { next(err); }
});

configurationRouter.patch('/categories/:code', ...canManageConfig, async (req, res, next) => {
  try {
    const result = updateCategorySchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const updated = await svc.setCategoryCeiling(
      req.params.code,
      result.data.discount_ceiling_percent,
      req.user.id
    );
    res.json({ category: updated });
  } catch (err) { next(err); }
});

configurationRouter.get('/approval-policy', requireAuth, requireRole('admin', 'sales_manager', 'finance_operations'), async (_req, res, next) => {
  try {
    const policy = await svc.getApprovalPolicy();
    res.json({ policy });
  } catch (err) { next(err); }
});

configurationRouter.put('/approval-policy', ...canManageConfig, async (req, res, next) => {
  try {
    const result = updateApprovalPolicySchema.safeParse(req.body);
    if (!result.success) throw new ValidationError('Invalid input', result.error.flatten().fieldErrors);

    const policy = await svc.setApprovalPolicy(
      result.data.manager_max_blended_risk_percent,
      result.data.high_risk_route,
      req.user.id
    );
    res.status(201).json({ policy });
  } catch (err) { next(err); }
});

configurationRouter.get('/deal-health-policy', requireAuth, requireRole('admin', 'sales_manager', 'finance_operations'), async (_req, res, next) => {
  try {
    const policy = await svc.getDealHealthPolicy();
    res.json({ policy });
  } catch (err) { next(err); }
});
