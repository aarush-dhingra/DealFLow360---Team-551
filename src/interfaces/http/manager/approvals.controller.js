import { validate } from '../../../shared/http/validate.js';
import { approvalActionSchema } from './schemas.js';
import * as approvalsSvc from '../../../domains/approvals/service.js';

export async function listApprovals(req, res, next) {
  try {
    const { required_role, status, limit, offset } = req.query;
    const approvals = await approvalsSvc.listApprovals({
      requiredRole: required_role,
      status,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    res.json({ approvals, count: approvals.length });
  } catch (err) { next(err); }
}

export async function getApproval(req, res, next) {
  try {
    res.json({ approval: await approvalsSvc.getApprovalDetail(req.params.id) });
  } catch (err) { next(err); }
}

export async function approveQuotation(req, res, next) {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.approveQuotation(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
}

export async function rejectQuotation(req, res, next) {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.rejectQuotation(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
}

export async function returnForRevision(req, res, next) {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.returnForRevision(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
}

export async function escalateToFinance(req, res, next) {
  try {
    const data = validate(approvalActionSchema, req.body);
    res.json(await approvalsSvc.escalateToFinance(req.params.id, req.user, data.reason));
  } catch (err) { next(err); }
}
