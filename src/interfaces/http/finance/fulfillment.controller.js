/**
 * Finance fulfillment HTTP controller (thin; rules live in the domain service).
 */

import {
  allocateFulfillment,
  previewFulfillmentPlan,
  consolidateBackorders
} from '../../../domains/finance/fulfillment/service.js';
import { asyncHandler, financePrincipal } from './middleware.js';
import { parse, allocateParams, allocateBody } from './schemas.js';

/** GET plan — view recommended split (Manager/Finance). Read-only. */
export const previewPlanController = asyncHandler(async (req, res) => {
  const params = parse(allocateParams, req.params);
  const result = await previewFulfillmentPlan({ quotationId: params.quotationId });
  res.status(200).json({ data: result });
});

export const allocateFulfillmentController = asyncHandler(async (req, res) => {
  const params = parse(allocateParams, req.params);
  const body = parse(allocateBody, req.body);

  const result = await allocateFulfillment({
    quotationId: params.quotationId,
    mode: body.mode,
    manualAllocations: body.allocations,
    principal: financePrincipal(req)
  });

  res.status(200).json({ data: result });
});

export const consolidateBackordersController = asyncHandler(async (req, res) => {
  const params = parse(allocateParams, req.params);
  const result = await consolidateBackorders({
    quotationId: params.quotationId,
    principal: financePrincipal(req)
  });
  res.status(200).json({ data: result });
});
