import { Router } from 'express';
import { managerRouter } from './interfaces/http/manager/routes.js';
import { adminRouter } from './interfaces/http/admin/routes.js';
import { salesRepRouter } from './interfaces/http/sales-rep/routes.js';
import { financeRouter } from './interfaces/http/finance/routes.js';
import { customerPortalRouter } from './interfaces/http/customer-portal/routes.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

apiRouter.use(managerRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/rep', salesRepRouter);
apiRouter.use('/finance', financeRouter);
apiRouter.use('/portal', customerPortalRouter);
