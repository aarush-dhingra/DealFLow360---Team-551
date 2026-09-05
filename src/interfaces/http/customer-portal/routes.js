import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';

export const customerPortalRouter = Router();

// Customer Portal endpoints: view quotes, accept/counter-offer, download PDFs.
// Implement in feature/customer-portal.

customerPortalRouter.get('/health', requireAuth, requireRole('customer', 'admin'), (_req, res) => {
  res.json({ status: 'customer portal online' });
});
