// Sales Representative HTTP surface.
import { Router } from 'express';
import { validate } from '../../../shared/http.js';
import { requireAuthentication, requireRole } from '../../../modules/identity/auth.middleware.js';
import { createQuoteSchema, idParams, revisionSchema } from './sales-rep.schemas.js';
import * as salesRepController from './sales-rep.controller.js';

export const quoteRouter = Router();

quoteRouter.use(requireAuthentication);

// Lookup endpoints for the new-quotation form
import { pool } from '../../../infrastructure/database/pool.js';
quoteRouter.get('/meta/customers', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT c.id, c.legal_name, COALESCE(ct.code, 'none') AS tier_code, COALESCE(ct.entitlement_discount_percent, 0) AS entitlement_discount_percent FROM customers c LEFT JOIN customer_tiers ct ON ct.id = c.tier_id ORDER BY c.legal_name`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});
quoteRouter.get('/meta/products', async (_req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.id, p.name, p.sku, p.list_price, p.unit_name, c.code AS category_code, c.discount_ceiling_percent FROM products p JOIN product_categories c ON c.id = p.category_id WHERE p.is_active ORDER BY p.name`
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

quoteRouter.get('/meta/upsell-suggestions', async (req, res, next) => {
  try {
    const ids = String(req.query.productIds ?? '').split(',').map((s) => s.trim()).filter(Boolean);
    if (ids.length === 0) return res.json({ data: [] });
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await pool.query(
      `SELECT DISTINCT ON (sp.id)
         ur.id AS rule_id, ur.rule_kind, ur.promotion_tag, ur.rank_weight, ur.minimum_margin_percent,
         sp.id, sp.name, sp.sku, sp.list_price, sp.unit_name,
         c.discount_ceiling_percent,
         ROUND((sp.list_price - sp.standard_cost) / NULLIF(sp.list_price, 0) * 100, 1) AS margin_percent
       FROM upsell_rules ur
       JOIN products sp ON sp.id = ur.suggested_product_id
       JOIN product_categories c ON c.id = sp.category_id
       WHERE ur.trigger_product_id IN (${placeholders})
         AND sp.is_active
         AND sp.id NOT IN (${placeholders})
       ORDER BY sp.id, ur.rank_weight DESC`,
      ids
    );
    res.json({ data: rows });
  } catch (err) { next(err); }
});

quoteRouter.get('/', salesRepController.listQuotations);
quoteRouter.post('/', requireRole('sales_rep', 'admin'), validate(createQuoteSchema), salesRepController.createQuotation);
quoteRouter.get('/:quoteId', validate(idParams, 'params'), salesRepController.getQuotation);
quoteRouter.post('/:quoteId/revisions', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), validate(revisionSchema), salesRepController.createRevision);
quoteRouter.post('/:quoteId/submit', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), salesRepController.submitQuotation);
quoteRouter.get('/:quoteId/timeline', validate(idParams, 'params'), salesRepController.getTimeline);
quoteRouter.get('/:quoteId/negotiation-requests', validate(idParams, 'params'), salesRepController.getNegotiationRequests);
quoteRouter.get('/:quoteId/health', validate(idParams, 'params'), salesRepController.getDealHealth);
