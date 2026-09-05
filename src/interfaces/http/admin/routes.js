import { Router } from 'express';
import { requireAuth, requireRole } from '../../../shared/http/auth.middleware.js';

export const adminRouter = Router();

// Admin-only endpoints: user management, system config, audit exports.
// Implement in feature/admin-backend.

adminRouter.get('/health', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ status: 'admin interface online' });
});
