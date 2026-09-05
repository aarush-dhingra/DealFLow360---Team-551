/**
 * Request DTO validation for finance HTTP endpoints.
 *
 * Uses zod (already a project dependency) at the API boundary; domain code
 * never sees raw wire shapes.
 */

import { z } from 'zod';

export const approvalDecisionParams = z.object({
  quotationId: z.string().uuid(),
  approvalInstanceId: z.string().uuid()
});

export const approvalDecisionBody = z.object({
  action: z.enum(['approve', 'reject', 'return_for_revision']),
  reason: z.string().trim().min(1).max(2000)
});

export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message
    }));
    const error = new Error('Validation failed');
    error.code = 'VALIDATION_ERROR';
    error.status = 400;
    error.details = details;
    throw error;
  }
  return result.data;
}

export const allocateParams = z.object({
  quotationId: z.string().uuid()
});

const moneyString = z
  .string()
  .regex(/^\d+(\.\d+)?$/, 'quantity must be a decimal string');

export const manualAllocationItem = z.object({
  quotationLineId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: moneyString
});

export const allocateBody = z
  .object({
    mode: z.enum(['suggested', 'manual']),
    allocations: z.array(manualAllocationItem).optional()
  })
  .superRefine((data, ctx) => {
    if (data.mode === 'manual' && (!data.allocations || data.allocations.length === 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'allocations[] is required when mode is manual'
      });
    }
    if (data.mode === 'suggested' && data.allocations) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['allocations'],
        message: 'allocations[] is not allowed when mode is suggested'
      });
    }
  });
