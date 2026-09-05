import { Router } from 'express';
import { authRouter } from './modules/identity/auth.router.js';
import { adminRouter } from './interfaces/http/admin/admin.routes.js';
import { approvalRouter, quoteRouter } from './interfaces/http/sales-rep/sales-rep.routes.js';

export const apiRouter = Router();

// Register module routers here. Keep controllers thin and put domain rules in services.
apiRouter.get('/', (_request, response) => {
  response.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/quotations', quoteRouter);
apiRouter.use('/approvals', approvalRouter);
