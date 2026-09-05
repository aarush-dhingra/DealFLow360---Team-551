import { z } from 'zod';

export const updateTierSchema = z.object({
  entitlement_discount_percent: z
    .number()
    .min(0, 'Must be at least 0')
    .max(100, 'Cannot exceed 100'),
});

export const updateCategorySchema = z.object({
  discount_ceiling_percent: z
    .number()
    .min(0, 'Must be at least 0')
    .max(100, 'Cannot exceed 100'),
});

export const updateApprovalPolicySchema = z.object({
  manager_max_blended_risk_percent: z
    .number()
    .min(0)
    .max(100),
  high_risk_route: z.enum(['manager_then_finance', 'finance_direct']),
});
