import { z } from 'zod';

const uuid = z.string().uuid();

export const quoteIdParams = z.object({ quoteId: uuid });
export const fulfillmentOrderIdParams = z.object({ fulfillmentOrderId: uuid });
export const manualFulfillmentSchema = z.object({
  allocations: z.array(z.object({
    quotationLineId: uuid,
    warehouseId: uuid,
    quantity: z.coerce.number().finite().positive()
  })).min(1)
});
