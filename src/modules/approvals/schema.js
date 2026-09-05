import { z } from 'zod';

export const actionSchema = z.object({
  reason: z.string().min(1, 'Reason is required').max(1000),
});
