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
  high_risk_route: z.literal('manager_then_finance'),
});

export const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const invoiceIdParams = z.object({ invoiceId: z.string().uuid() });
export const invoiceListQuerySchema = listQuerySchema.extend({
  status: z.enum(['draft', 'issued', 'partially_paid', 'paid', 'overdue', 'void', 'credited']).optional()
});
export const reportQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  ownerUserId: z.string().uuid().optional(),
  approvalStatus: z.enum(['draft', 'sent_to_customer', 'under_negotiation', 'pending_manager_approval', 'pending_finance_approval', 'approved', 'customer_confirmed', 'confirmed', 'in_fulfillment', 'partially_fulfilled', 'fulfilled', 'invoiced', 'partially_paid', 'paid', 'rejected', 'returned_for_revision', 'cancelled', 'expired', 'superseded']).optional(),
  productId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional()
}).refine((value) => !value.from || !value.to || value.from <= value.to, { message: 'from must be before to.' });
