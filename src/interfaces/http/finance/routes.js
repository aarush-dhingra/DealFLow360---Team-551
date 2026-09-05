import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';

export const financeRouter = Router();

// Finance Operations endpoints: approval queue, margin reports, billing views.
// Implement in feature/finance-backend.

financeRouter.get('/health', requireAuth, requireRole('finance_operations', 'admin'), (_req, res) => {
  res.json({ status: 'finance interface online' });
});
