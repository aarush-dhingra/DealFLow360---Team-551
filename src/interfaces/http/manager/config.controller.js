import { validate } from '../../../shared/http/validate.js';
import {
  updateTierSchema,
  updateCategorySchema,
  updateApprovalPolicySchema
} from './schemas.js';
import * as tiersRepo from '../../../domains/customers/repository.js';
import * as catalogueRepo from '../../../domains/catalogue/repository.js';
import * as approvalsRepo from '../../../domains/approvals/repository.js';
import * as dealHealthRepo from '../../../domains/deal-health/repository.js';
import { NotFoundError } from '../../../shared/http/errors.js';

export async function listTiers(_req, res, next) {
  try {
    res.json({ tiers: await tiersRepo.getTiers() });
  } catch (err) { next(err); }
}

export async function updateTier(req, res, next) {
  try {
    const data = validate(updateTierSchema, req.body);
    const updated = await tiersRepo.updateTierEntitlement(
      req.params.code, data.entitlement_discount_percent, req.user.id
    );
    if (!updated) throw new NotFoundError('Customer tier');
    res.json({ tier: updated });
  } catch (err) { next(err); }
}

export async function listCategories(_req, res, next) {
  try {
    res.json({ categories: await catalogueRepo.getCategories() });
  } catch (err) { next(err); }
}

export async function updateCategory(req, res, next) {
  try {
    const data = validate(updateCategorySchema, req.body);
    const updated = await catalogueRepo.updateCategoryCeiling(
      req.params.code, data.discount_ceiling_percent, req.user.id
    );
    if (!updated) throw new NotFoundError('Product category');
    res.json({ category: updated });
  } catch (err) { next(err); }
}

export async function getApprovalPolicy(_req, res, next) {
  try {
    res.json({ policy: await approvalsRepo.getActiveApprovalPolicy() });
  } catch (err) { next(err); }
}

export async function updateApprovalPolicy(req, res, next) {
  try {
    const data = validate(updateApprovalPolicySchema, req.body);
    const policy = await approvalsRepo.upsertApprovalPolicy(
      data.manager_max_blended_risk_percent,
      data.high_risk_route,
      req.user.id
    );
    res.status(201).json({ policy });
  } catch (err) { next(err); }
}

export async function getDealHealthPolicy(_req, res, next) {
  try {
    res.json({ policy: await dealHealthRepo.getActiveDealHealthPolicy() });
  } catch (err) { next(err); }
}

export async function getSubscriptionPlan(req, res, next) {
  try {
    const { rows } = await (await import('../../../infrastructure/database/pool.js')).pool.query(`SELECT sp.*,count(s.id)::int AS subscription_count FROM subscription_plans sp LEFT JOIN subscriptions s ON s.plan_id=sp.id WHERE sp.id=$1 GROUP BY sp.id`, [req.params.id]);
    if (!rows[0]) throw new NotFoundError('Subscription plan');
    res.json({ plan: rows[0] });
  } catch (err) { next(err); }
}

export async function listSubscriptionPlans(_req, res, next) {
  try { const { rows } = await (await import('../../../infrastructure/database/pool.js')).pool.query('SELECT * FROM subscription_plans ORDER BY code'); res.json({ plans: rows }); } catch (err) { next(err); }
}
