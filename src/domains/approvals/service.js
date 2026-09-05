import { pool } from '../../infrastructure/database/pool.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/http/errors.js';
import * as repo from './repository.js';

export async function listApprovals({ requiredRole, status, limit, offset } = {}) {
  return repo.listApprovals({ requiredRole, status, limit, offset });
}

export async function getApprovalDetail(id) {
  const approval = await repo.getApprovalWithFullDetail(id);
  if (!approval) throw new NotFoundError('Approval');
  return approval;
}

async function validateApproverAction(approvalId, actorUser) {
  const approval = await repo.getApprovalById(approvalId);
  if (!approval) throw new NotFoundError('Approval');
  if (approval.status !== 'pending') {
    throw new ConflictError(`Approval is already ${approval.status}`);
  }
  if (
    !actorUser.roles.includes(approval.required_role) &&
    !actorUser.roles.includes('admin')
  ) {
    throw new ForbiddenError(`This approval requires the ${approval.required_role} role`);
  }

  const { rows } = await pool.query(
    `SELECT lock_version, status FROM quotations WHERE id = $1`,
    [approval.quotation_id]
  );
  if (!rows.length) throw new NotFoundError('Quotation');
  return { approval, quotation: rows[0] };
}

export async function approveQuotation(approvalId, actorUser, reason) {
  const { approval, quotation } = await validateApproverAction(approvalId, actorUser);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await repo.updateApprovalStatus(client, approvalId, 'approved', actorUser.id, reason);
    await repo.recordApprovalAction(client, approvalId, actorUser.id, 'approve', reason);

    let nextQuoteStatus = 'approved';

    if (approval.required_role === 'sales_manager') {
      const { rows: riskRows } = await client.query(
        `SELECT route FROM risk_assessments WHERE id = $1`,
        [approval.risk_assessment_id]
      );

      // Use the immutable route assessed for this quote version, not today's
      // active policy. Policy changes must not rewrite an approval already in flight.
      if (riskRows[0]?.route === 'manager_then_finance') {
        await repo.createFinanceApprovalInstance(
          client,
          approval.quotation_id,
          approval.quotation_version_id,
          approval.risk_assessment_id
        );
        nextQuoteStatus = 'pending_finance_approval';
      }
    }

    const updated = await repo.updateQuotationStatus(
      client, approval.quotation_id, nextQuoteStatus, quotation.lock_version
    );
    if (!updated) throw new ConflictError('Quotation was modified by another request. Please retry.');

    await repo.insertAuditEvent(client, {
      aggregateType: 'approval_instance',
      aggregateId: approvalId,
      quotationId: approval.quotation_id,
      quotationVersionId: approval.quotation_version_id,
      eventType: 'approval_approved',
      actorUserId: actorUser.id,
      afterState: { status: 'approved', next_quote_status: nextQuoteStatus },
      metadata: { reason },
    });

    await repo.insertOutboxEvent(client, 'quotation', approval.quotation_id, 'approval_approved', {
      quotation_id: approval.quotation_id,
      approval_id: approvalId,
      next_status: nextQuoteStatus,
      approved_by: actorUser.id,
    });

    await client.query('COMMIT');
    return { approved: true, next_status: nextQuoteStatus };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function rejectQuotation(approvalId, actorUser, reason) {
  const { approval, quotation } = await validateApproverAction(approvalId, actorUser);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await repo.updateApprovalStatus(client, approvalId, 'rejected', actorUser.id, reason);
    await repo.recordApprovalAction(client, approvalId, actorUser.id, 'reject', reason);

    await client.query(
      `UPDATE approval_instances SET status = 'cancelled'
       WHERE quotation_version_id = $1 AND id != $2 AND status = 'pending'`,
      [approval.quotation_version_id, approvalId]
    );

    const updated = await repo.updateQuotationStatus(
      client, approval.quotation_id, 'rejected', quotation.lock_version
    );
    if (!updated) throw new ConflictError('Quotation was modified by another request. Please retry.');

    await repo.insertAuditEvent(client, {
      aggregateType: 'approval_instance',
      aggregateId: approvalId,
      quotationId: approval.quotation_id,
      quotationVersionId: approval.quotation_version_id,
      eventType: 'approval_rejected',
      actorUserId: actorUser.id,
      afterState: { status: 'rejected' },
      metadata: { reason },
    });

    await repo.insertOutboxEvent(client, 'quotation', approval.quotation_id, 'approval_rejected', {
      quotation_id: approval.quotation_id,
      approval_id: approvalId,
      rejected_by: actorUser.id,
      reason,
    });

    await client.query('COMMIT');
    return { rejected: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function returnForRevision(approvalId, actorUser, reason) {
  const { approval, quotation } = await validateApproverAction(approvalId, actorUser);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await repo.updateApprovalStatus(client, approvalId, 'returned_for_revision', actorUser.id, reason);
    await repo.recordApprovalAction(client, approvalId, actorUser.id, 'return_for_revision', reason);

    const updated = await repo.updateQuotationStatus(
      client, approval.quotation_id, 'returned_for_revision', quotation.lock_version
    );
    if (!updated) throw new ConflictError('Quotation was modified by another request. Please retry.');

    await repo.insertAuditEvent(client, {
      aggregateType: 'approval_instance',
      aggregateId: approvalId,
      quotationId: approval.quotation_id,
      quotationVersionId: approval.quotation_version_id,
      eventType: 'approval_returned_for_revision',
      actorUserId: actorUser.id,
      afterState: { status: 'returned_for_revision' },
      metadata: { reason },
    });

    await repo.insertOutboxEvent(client, 'quotation', approval.quotation_id, 'approval_returned', {
      quotation_id: approval.quotation_id,
      approval_id: approvalId,
      returned_by: actorUser.id,
      reason,
    });

    await client.query('COMMIT');
    return { returned: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function escalateToFinance(approvalId, actorUser, reason) {
  const { approval, quotation } = await validateApproverAction(approvalId, actorUser);

  if (approval.required_role !== 'sales_manager') {
    throw new ForbiddenError('Only manager-step approvals can be escalated to Finance');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await repo.updateApprovalStatus(client, approvalId, 'escalated', actorUser.id, reason);
    await repo.recordApprovalAction(client, approvalId, actorUser.id, 'escalate', reason);

    await repo.createFinanceApprovalInstance(
      client,
      approval.quotation_id,
      approval.quotation_version_id,
      approval.risk_assessment_id
    );

    const updated = await repo.updateQuotationStatus(
      client, approval.quotation_id, 'pending_finance_approval', quotation.lock_version
    );
    if (!updated) throw new ConflictError('Quotation was modified by another request. Please retry.');

    await repo.insertAuditEvent(client, {
      aggregateType: 'approval_instance',
      aggregateId: approvalId,
      quotationId: approval.quotation_id,
      quotationVersionId: approval.quotation_version_id,
      eventType: 'approval_escalated_to_finance',
      actorUserId: actorUser.id,
      afterState: { status: 'escalated' },
      metadata: { reason },
    });

    await repo.insertOutboxEvent(client, 'quotation', approval.quotation_id, 'escalated_to_finance', {
      quotation_id: approval.quotation_id,
      escalated_by: actorUser.id,
      reason,
    });

    await client.query('COMMIT');
    return { escalated: true };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
