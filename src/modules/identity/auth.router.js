import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/http.js';
import { requireAuthentication } from './auth.middleware.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.toLowerCase())
});

authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.get('/me', requireAuthentication, authController.currentUser);
authRouter.post('/logout', requireAuthentication, authController.logout);
