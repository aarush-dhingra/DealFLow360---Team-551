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

quoteRouter.get('/', salesRepController.listQuotations);
quoteRouter.post('/', requireRole('sales_rep', 'admin'), validate(createQuoteSchema), salesRepController.createQuotation);
quoteRouter.get('/:quoteId', validate(idParams, 'params'), salesRepController.getQuotation);
quoteRouter.post('/:quoteId/revisions', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), validate(revisionSchema), salesRepController.createRevision);
quoteRouter.post('/:quoteId/submit', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), salesRepController.submitQuotation);
quoteRouter.get('/:quoteId/timeline', validate(idParams, 'params'), salesRepController.getTimeline);
quoteRouter.get('/:quoteId/health', validate(idParams, 'params'), salesRepController.getDealHealth);
