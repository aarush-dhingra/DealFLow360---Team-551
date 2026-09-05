import { Router } from 'express';
import { validate } from '../../../shared/http.js';
import { requireAuthentication, requireRole } from '../../../modules/identity/auth.middleware.js';
import { acceptManualFulfillment, acceptSuggestedFulfillment, getFulfillmentOrder, previewFulfillment } from '../../../domains/fulfillment/service.js';
import { fulfillmentOrderIdParams, manualFulfillmentSchema, quoteIdParams } from '../fulfillment.schemas.js';

export const financeRouter = Router();
financeRouter.use(requireAuthentication, requireRole('finance_operations', 'admin'));

// Finance/Operations owns fulfillment decisions. Billing remains under construction.
financeRouter.get('/fulfillment/quotes/:quoteId/suggestion', validate(quoteIdParams, 'params'), async (request, response, next) => {
  try { response.json({ data: await previewFulfillment(request.validated.params.quoteId) }); } catch (error) { next(error); }
});
financeRouter.post('/fulfillment/quotes/:quoteId/accept-suggestion', validate(quoteIdParams, 'params'), async (request, response, next) => {
  try { response.status(201).json({ data: await acceptSuggestedFulfillment(request.validated.params.quoteId, request.principal.id) }); } catch (error) { next(error); }
});
financeRouter.post('/fulfillment/quotes/:quoteId/manual-override', validate(quoteIdParams, 'params'), validate(manualFulfillmentSchema), async (request, response, next) => {
  try { response.status(201).json({ data: await acceptManualFulfillment(request.validated.params.quoteId, request.principal.id, request.validated.body.allocations) }); } catch (error) { next(error); }
});
financeRouter.get('/fulfillment/orders/:fulfillmentOrderId', validate(fulfillmentOrderIdParams, 'params'), async (request, response, next) => {
  try { response.json({ data: await getFulfillmentOrder(request.validated.params.fulfillmentOrderId) }); } catch (error) { next(error); }
});

financeRouter.get('/health', (_req, res) => {
  res.json({ status: 'finance interface online' });
});
