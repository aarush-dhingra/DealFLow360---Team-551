import { z } from 'zod';

export const approvalActionSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(1000),
});

export const updateTierSchema = z.object({
  entitlement_discount_percent: z.number().min(0).max(100),
});

export const updateCategorySchema = z.object({
  discount_ceiling_percent: z.number().min(0).max(100),
});

export const updateApprovalPolicySchema = z.object({
  manager_max_blended_risk_percent: z.number().min(0).max(100),
  high_risk_route: z.enum(['manager_then_finance', 'finance_direct']),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
