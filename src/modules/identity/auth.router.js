import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../shared/http.js';
import { requireAuthentication } from './auth.middleware.js';
import * as authController from './auth.controller.js';

export const authRouter = Router();

const forgotPasswordSchema = z.object({
  email: z.string().email().max(320).transform((v) => v.toLowerCase())
});
const resetPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  newPassword: z.string().min(8).max(128)
});

const loginSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128)
});
const passwordSchema = z.object({ newPassword: z.string().min(8).max(128) });
const customerSignupSchema = z.object({
  email: z.string().email().max(320).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(1).max(150)
});

authRouter.post('/login', validate(loginSchema), authController.login);
authRouter.post('/forgot-password', validate(forgotPasswordSchema), authController.forgotPassword);
authRouter.post('/reset-password', validate(resetPasswordSchema), authController.resetPassword);
authRouter.post('/customer-signup', validate(customerSignupSchema), authController.customerSignup);
authRouter.post('/change-password', requireAuthentication, validate(passwordSchema), authController.changePassword);
authRouter.get('/me', requireAuthentication, authController.currentUser);
authRouter.post('/logout', requireAuthentication, authController.logout);
