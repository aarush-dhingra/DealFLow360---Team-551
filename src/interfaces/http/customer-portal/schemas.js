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

export const listQuotesQuerySchema = z.object({
  status: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const threadQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
