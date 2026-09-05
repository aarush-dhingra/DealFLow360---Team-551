import { Router } from 'express';
import { authRouter } from './modules/identity/auth.router.js';
import { adminRouter } from './interfaces/http/admin/admin.routes.js';
import { quoteRouter } from './interfaces/http/sales-rep/sales-rep.routes.js';
import { managerRouter } from './interfaces/http/manager/routes.js';
import { financeRouter } from './interfaces/http/finance/router.js';
import { customerPortalRouter } from './interfaces/http/customer-portal/routes.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/sales-rep/quotations', quoteRouter);
apiRouter.use('/manager', managerRouter);
apiRouter.use('/finance', financeRouter);
apiRouter.use('/portal', customerPortalRouter);
