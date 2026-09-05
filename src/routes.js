import { Router } from 'express';
import { authRouter } from './modules/identity/auth.router.js';
import { adminRouter } from './interfaces/http/admin/admin.routes.js';
import { quoteRouter } from './interfaces/http/sales-rep/sales-rep.routes.js';
import { configurationRouter } from './modules/configuration/router.js';
import { quotationsRouter } from './modules/quotations/router.js';
import { riskRouter } from './modules/risk/router.js';
import { approvalsRouter } from './modules/approvals/router.js';
import { dealHealthRouter } from './modules/deal-health/router.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

apiRouter.use('/auth', authRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/sales-rep/quotations', quoteRouter);
apiRouter.use('/manager/config', configurationRouter);
apiRouter.use('/manager/quotations', quotationsRouter);
apiRouter.use('/manager/risk', riskRouter);
apiRouter.use('/manager/approvals', approvalsRouter);
apiRouter.use('/manager/deal-health', dealHealthRouter);
