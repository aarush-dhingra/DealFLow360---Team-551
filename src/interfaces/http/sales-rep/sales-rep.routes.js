// Sales Representative HTTP surface.
import { Router } from 'express';
import { validate } from '../../../shared/http.js';
import { requireAuthentication, requireRole } from '../../../modules/identity/auth.middleware.js';
import { createQuoteSchema, idParams, revisionSchema } from './sales-rep.schemas.js';
import * as salesRepController from './sales-rep.controller.js';

export const quoteRouter = Router();

quoteRouter.use(requireAuthentication);

quoteRouter.get('/', salesRepController.listQuotations);
quoteRouter.post('/', requireRole('sales_rep', 'admin'), validate(createQuoteSchema), salesRepController.createQuotation);
quoteRouter.get('/:quoteId', validate(idParams, 'params'), salesRepController.getQuotation);
quoteRouter.post('/:quoteId/revisions', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), validate(revisionSchema), salesRepController.createRevision);
quoteRouter.post('/:quoteId/submit', requireRole('sales_rep', 'admin'), validate(idParams, 'params'), salesRepController.submitQuotation);
quoteRouter.get('/:quoteId/timeline', validate(idParams, 'params'), salesRepController.getTimeline);
quoteRouter.get('/:quoteId/health', validate(idParams, 'params'), salesRepController.getDealHealth);
