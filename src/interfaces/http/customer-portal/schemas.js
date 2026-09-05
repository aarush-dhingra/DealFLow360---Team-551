import { z } from 'zod';

export const counterOfferSchema = z.object({
  message_text: z.string().min(1).max(2000),
  requested_discount_percent: z.number().min(0).max(100).optional(),
  line_id: z.string().uuid().optional(),
  lock_version: z.number().int().positive(),
});

export const acceptQuoteSchema = z.object({
  lock_version: z.number().int().positive(),
});
export const structuredNegotiationSchema = z.object({ lock_version: z.number().int().positive(), counter_discount_percent: z.number().min(0).max(100).nullable().optional(), requested_delivery_date: z.string().date().nullable().optional(), line_requests: z.array(z.object({ line_id: z.string().uuid(), comment: z.string().trim().min(1).max(2000) })).max(100).default([]) }).refine(v => v.counter_discount_percent != null || v.requested_delivery_date != null || v.line_requests.length > 0, { message: 'Add a line comment, counter discount, or delivery request.' });

export const listQuotesQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const threadQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
