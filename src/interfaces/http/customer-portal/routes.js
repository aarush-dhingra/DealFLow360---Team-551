import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';
import * as portalController from './portal.controller.js';

export const customerPortalRouter = Router();

const portal = ['customer_portal'];

customerPortalRouter.get('/health', requireAuth, requireRole(...portal, 'admin'), portalController.health);
customerPortalRouter.get('/tier', requireAuth, requireRole(...portal), portalController.tierProgress);
customerPortalRouter.get('/quotes', requireAuth, requireRole(...portal), portalController.listQuotes);
customerPortalRouter.get('/quotes/:id', requireAuth, requireRole(...portal), portalController.getQuote);
customerPortalRouter.get('/quotes/:id/versions/:n', requireAuth, requireRole(...portal), portalController.getVersion);
customerPortalRouter.get('/quotes/:id/messages', requireAuth, requireRole(...portal), portalController.getMessages);
customerPortalRouter.post('/quotes/:id/accept', requireAuth, requireRole(...portal), portalController.acceptQuotation);
customerPortalRouter.post('/quotes/:id/counter', requireAuth, requireRole(...portal), portalController.submitCounterOffer);
customerPortalRouter.get('/quote-requests', requireAuth, requireRole(...portal), portalController.listMyQuoteRequests);
customerPortalRouter.post('/quote-requests', requireAuth, requireRole(...portal), portalController.createQuoteRequest);
