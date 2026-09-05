/**
 * Finance approval HTTP controller (thin; business logic lives in the domain
 * service).
 */

import { decideApproval } from '../../../domains/finance/approval/service.js';
import { asyncHandler } from './middleware.js';
import { parse, approvalDecisionParams, approvalDecisionBody } from './schemas.js';

export const decideApprovalController = asyncHandler(async (req, res) => {
  const params = parse(approvalDecisionParams, req.params);
  const body = parse(approvalDecisionBody, req.body);

  const result = await decideApproval({
    quotationId: params.quotationId,
    approvalInstanceId: params.approvalInstanceId,
    action: body.action,
    reason: body.reason,
    principal: req.principal
  });

  res.status(200).json({ data: result });
});
