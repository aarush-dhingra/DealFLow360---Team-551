import { Router } from 'express';
import { requireAuthentication, requireRole } from '../../../modules/identity/auth.middleware.js';
import { adminController } from './admin.controller.js';

export const adminRouter = Router();

adminRouter.use(requireAuthentication, requireRole('admin'));
adminRouter.use(adminController);
