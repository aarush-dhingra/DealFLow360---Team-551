import { Router } from 'express';

export const apiRouter = Router();

// Register module routers here. Keep controllers thin and put domain rules in services.
apiRouter.get('/', (_request, response) => {
  response.status(200).json({ service: 'dealflow360-api', version: 'v1' });
});
