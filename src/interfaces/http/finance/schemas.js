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
    allocations: z.array(manualAllocationItem).optional(),
    reason: z.string().trim().max(2000).optional()
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

export const invoiceParams = z.object({
  invoiceId: z.string().uuid()
});

export const voidInvoiceBody = z.object({
  reason: z.string().trim().max(2000).optional()
});

export const consolidateBody = z.object({
  reason: z.string().trim().max(2000).optional()
});

export const applyPaymentBody = z.object({
  amount: moneyString.refine((v) => Number(v) > 0, 'amount must be greater than zero'),
  method: z.string().trim().min(1),
  externalReference: z.string().trim().max(200).optional()
});

export const issueCreditNoteBody = z.object({
  amount: moneyString.refine((v) => Number(v) > 0, 'amount must be greater than zero'),
  reason: z.string().trim().min(1)
});

export const creditNoteParams = z.object({
  creditNoteId: z.string().uuid()
});

export const subscriptionParams = z.object({
  subscriptionId: z.string().uuid()
});

const isoDate = z.string().datetime({ offset: true }).optional();

export const cancelSubscriptionBody = z.object({
  effectiveDate: isoDate,
  reason: z.string().trim().max(2000).optional()
});

export const changeQuantityBody = z.object({
  newQuantity: z
    .string()
    .regex(/^\d+(\.\d+)?$/, 'newQuantity must be a decimal string')
    .refine((v) => Number(v) > 0, 'newQuantity must be greater than zero'),
  effectiveDate: isoDate,
  reason: z.string().trim().max(2000).optional()
});

export const healthAssessmentParams = z.object({
  assessmentId: z.string().uuid()
});

export const healthActionBody = z
  .object({
    action: z.enum(['acknowledge', 'escalate', 'resolve']),
    reason: z.string().trim().max(2000).optional()
  })
  .superRefine((data, ctx) => {
    if (data.action === 'resolve' && !data.reason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['reason'],
        message: 'reason is required to resolve a deal-health alert'
      });
    }
  });

export const financeQueueQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).optional()
});

export const revenueReportQuery = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  ownerUserId: z.string().uuid().optional(),
  status: z
    .enum(['issued', 'partially_paid', 'paid', 'overdue', 'credited', 'void'])
    .optional(),
  format: z.enum(['json', 'csv']).optional()
});

export const outstandingReportQuery = z.object({
  asOf: z.string().datetime({ offset: true }).optional(),
  ownerUserId: z.string().uuid().optional(),
  format: z.enum(['json', 'csv']).optional()
});
