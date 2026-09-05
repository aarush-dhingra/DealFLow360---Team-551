import { Router } from 'express';
import { financeRouter } from './interfaces/http/finance/router.js';

export const apiRouter = Router();

// Register module routers here. Keep controllers thin and put domain rules in services.
apiRouter.get('/', (_request, response) => {
  response.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});

// Finance APIs live under /api/v1/finance.
apiRouter.use('/finance', financeRouter);
