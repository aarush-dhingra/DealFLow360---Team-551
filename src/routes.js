import { Router } from 'express';
import { configurationRouter } from './modules/configuration/router.js';
import { quotationsRouter } from './modules/quotations/router.js';
import { riskRouter } from './modules/risk/router.js';
import { approvalsRouter } from './modules/approvals/router.js';
import { dealHealthRouter } from './modules/deal-health/router.js';

export const apiRouter = Router();

apiRouter.get('/', (_req, res) => {
  res.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

apiRouter.use('/config', configurationRouter);
apiRouter.use('/quotations', quotationsRouter);
apiRouter.use('/quotations/:quotationId/risk', riskRouter);
apiRouter.use('/approvals', approvalsRouter);
apiRouter.use('/deal-health', dealHealthRouter);
