import express from 'express';
import { apiRouter } from './routes.js';
import { errorHandler } from './shared/middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.use('/api/v1', apiRouter);

  app.use(errorHandler);

  return app;
}
