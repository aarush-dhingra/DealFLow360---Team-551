import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';

export const salesRepRouter = Router();

// Sales Rep endpoints: create/edit quotes, submit for approval, negotiate.
// Implement in feature/sales-rep-backend.

salesRepRouter.get('/health', requireAuth, requireRole('sales_rep', 'admin'), (_req, res) => {
  res.json({ status: 'sales-rep interface online' });
});
