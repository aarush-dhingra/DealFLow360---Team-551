/**
 * Finance subscriptions HTTP controller (thin).
 */

import {
  cancelSubscription,
  changeSubscriptionQuantity
} from '../../../domains/finance/subscriptions/service.js';
import { asyncHandler } from './middleware.js';
import {
  parse,
  subscriptionParams,
  cancelSubscriptionBody,
  changeQuantityBody
} from './schemas.js';

export const cancelSubscriptionController = asyncHandler(async (req, res) => {
  const params = parse(subscriptionParams, req.params);
  const body = parse(cancelSubscriptionBody, req.body);

  const result = await cancelSubscription({
    subscriptionId: params.subscriptionId,
    effectiveDate: body.effectiveDate,
    reason: body.reason,
    principal: req.principal
  });

  res.status(200).json({ data: result });
});

export const changeQuantityController = asyncHandler(async (req, res) => {
  const params = parse(subscriptionParams, req.params);
  const body = parse(changeQuantityBody, req.body);

  const result = await changeSubscriptionQuantity({
    subscriptionId: params.subscriptionId,
    newQuantity: body.newQuantity,
    effectiveDate: body.effectiveDate,
    reason: body.reason,
    principal: req.principal
  });

  res.status(200).json({ data: result });
});