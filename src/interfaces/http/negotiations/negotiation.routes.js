import { Router } from 'express';
import { z } from 'zod';
import { requireAuthentication, requireRole } from '../../../modules/identity/auth.middleware.js';
import { validate } from '../../../shared/http.js';
import { revisionSchema, idParams } from '../sales-rep/sales-rep.schemas.js';
import * as controller from './negotiation.controller.js';

export const negotiationRouter = Router();
negotiationRouter.use(requireAuthentication, requireRole('sales_rep','sales_manager','finance_operations','admin'));
negotiationRouter.get('/', controller.listCases);
negotiationRouter.get('/:quoteId', validate(idParams, 'params'), controller.getCaseDetail);
negotiationRouter.post('/:quoteId/revisions', validate(idParams, 'params'), validate(revisionSchema), controller.reviseCase);
negotiationRouter.post('/:quoteId/forward-to-finance', validate(idParams, 'params'), validate(z.object({ reason:z.string().trim().min(3).max(1000) })), controller.forwardToFinance);
