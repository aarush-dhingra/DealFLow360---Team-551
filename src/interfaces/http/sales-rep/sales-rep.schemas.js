// Request contracts owned by the Sales Representative API.
import { z } from 'zod';

const uuid = z.string().uuid();
const decimal = z.coerce.number().finite();
export const quoteLinesSchema = z.array(z.object({
  productId: uuid,
  productVariantId: uuid.nullable().optional(),
  quantity: decimal.positive(),
  lineDiscountPercent: decimal.min(0).max(100).optional()
})).min(1);
const quotePayloadSchema = z.object({ currencyCode: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/).default('USD'), discountMode: z.enum(['line', 'order']), orderDiscountPercent: decimal.min(0).max(100).optional(), lines: quoteLinesSchema, reason: z.string().trim().min(1).max(300).default('Initial quotation') });
const applyDiscountModeRules = (value, context) => {
  if (value.discountMode === 'order' && value.orderDiscountPercent === undefined) context.addIssue({ code: 'custom', path: ['orderDiscountPercent'], message: 'Order discount percentage is required.' });
  if (value.discountMode === 'line' && value.orderDiscountPercent !== undefined) context.addIssue({ code: 'custom', path: ['orderDiscountPercent'], message: 'Order discount cannot be used in line mode.' });
  if (value.discountMode === 'line' && value.lines.some((line) => line.lineDiscountPercent === undefined)) context.addIssue({ code: 'custom', path: ['lines'], message: 'Each line requires a discount in line mode.' });
};
export const createQuoteSchema = quotePayloadSchema.extend({
  customerId: uuid,
  quoteRequestId: uuid.optional()
}).superRefine(applyDiscountModeRules);
export const revisionSchema = quotePayloadSchema.extend({ expectedLockVersion: z.coerce.number().int().positive() }).superRefine(applyDiscountModeRules);
export const idParams = z.object({ quoteId: uuid, approvalId: uuid.optional() });
export const approvalActionSchema = z.object({ reason: z.string().trim().min(1).max(1000) });
export const messageSchema = z.object({ message: z.string().trim().min(1).max(4000), quotationLineId: uuid.nullable().optional(), requestedDiscountPercent: decimal.min(0).max(100).nullable().optional() });
