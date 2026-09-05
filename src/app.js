import express from 'express';
import { randomUUID } from 'node:crypto';
import { apiRouter } from './routes.js';
import { errorHandler, notFoundHandler } from './shared/http.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));
  app.use((request, response, next) => {
    request.id = request.get('x-request-id') ?? randomUUID();
    response.set('x-request-id', request.id);
    next();
  });

  app.get('/health', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });
  app.use('/api/v1', apiRouter);
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
