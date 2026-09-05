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
