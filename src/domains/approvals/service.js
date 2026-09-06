import { pool } from '../../infrastructure/database/pool.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../shared/http/errors.js';
import * as repo from './repository.js';
import { inTransaction, writeAuditAndOutbox } from '../../infrastructure/database/transaction.js';

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

/**
 * A Manager can turn a pending internal approval into a customer-facing
 * negotiation. The original approval remains in the audit trail as returned,
 * and a final exception will enter the approval route again after negotiation.
 */
export async function beginCustomerNegotiation(approvalId, actorUser) {
  if (!actorUser.roles.includes('sales_manager') && !actorUser.roles.includes('admin')) {
    throw new ForbiddenError('Only a Sales Manager can begin a customer negotiation.');
  }

  return inTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT ai.*, q.status AS quote_status, q.lock_version, q.current_version_number
       FROM approval_instances ai
       JOIN quotations q ON q.id = ai.quotation_id
       WHERE ai.id = $1 FOR UPDATE`,
      [approvalId]
    );
    const approval = rows[0];
    if (!approval) throw new NotFoundError('Approval');
    if (approval.status !== 'pending' || approval.required_role !== 'sales_manager') {
      throw new ConflictError('Only a pending Sales Manager approval can be moved into negotiation.');
    }

    const reason = 'Moved to customer negotiation by Sales Manager.';
    await repo.updateApprovalStatus(client, approvalId, 'returned_for_revision', actorUser.id, reason);
    // approval_actions.action is a constrained workflow enum. The customer-negotiation
    // transition is represented as a return for revision there; the dedicated audit
    // event below preserves the more specific customer-negotiation intent.
    await repo.recordApprovalAction(client, approvalId, actorUser.id, 'return_for_revision', reason);
    await client.query(
      `INSERT INTO negotiation_cases(quotation_id, owner_role, status, last_handoff_reason, updated_at)
       VALUES($1, 'sales_manager', 'open', $2, now())
       ON CONFLICT(quotation_id) DO UPDATE SET
         owner_role='sales_manager', status='open', last_handoff_reason=EXCLUDED.last_handoff_reason,
         resolved_at=NULL, updated_at=now()
       RETURNING id`,
      [approval.quotation_id, reason]
    );
    const caseRow = (await client.query(
      `SELECT id FROM negotiation_cases WHERE quotation_id=$1`, [approval.quotation_id]
    )).rows[0];
    await client.query(
      `INSERT INTO negotiation_case_events(negotiation_case_id,event_type,actor_user_id,to_role,reason,quotation_version_number)
       VALUES($1,'manager_opened_customer_negotiation',$2,'sales_manager',$3,$4)`,
      [caseRow.id, actorUser.id, reason, approval.current_version_number]
    );
    await client.query(
      `UPDATE quotations
       SET status='under_negotiation', lock_version=lock_version+1, last_activity_at=now(), updated_at=now()
       WHERE id=$1`,
      [approval.quotation_id]
    );
    await writeAuditAndOutbox(client, {
      aggregateType: 'approval_instance', aggregateId: approvalId,
      eventType: 'approval.moved_to_customer_negotiation', actorUserId: actorUser.id,
      beforeState: { approvalStatus: 'pending', quoteStatus: approval.quote_status },
      afterState: { approvalStatus: 'returned_for_revision', quoteStatus: 'under_negotiation' },
      metadata: { quotationId: approval.quotation_id, negotiationCaseId: caseRow.id }
    });
    return { quotationId: approval.quotation_id, negotiationCaseId: caseRow.id, status: 'under_negotiation' };
  });
}
