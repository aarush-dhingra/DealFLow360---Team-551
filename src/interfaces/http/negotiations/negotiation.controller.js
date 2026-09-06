import { pool } from '../../../infrastructure/database/pool.js';
import { inTransaction, writeAuditAndOutbox } from '../../../infrastructure/database/transaction.js';
import { AppError } from '../../../shared/http.js';
import { createQuoteVersion, routeApproval } from '../../../domains/sales-rep/quotation.service.js';
import { getQuotationById } from '../../../domains/quotations/repository.js';

const editableRole = (principal, role) => principal.roles.includes('admin') || principal.roles.includes(role);

async function getCase(client, quoteId, principal, lock = false) {
  const { rows } = await client.query(
    `SELECT nc.*, q.owner_user_id, q.lock_version, q.current_version_number, q.customer_id,
            EXISTS(SELECT 1 FROM negotiation_case_events nce WHERE nce.negotiation_case_id=nc.id AND nce.from_role='sales_manager') AS manager_forwarded_history
     FROM negotiation_cases nc JOIN quotations q ON q.id=nc.quotation_id
     WHERE nc.quotation_id=$1${lock ? ' FOR UPDATE' : ''}`,
    [quoteId]
  );
  const item = rows[0];
  if (!item) throw new AppError(404, 'NEGOTIATION_NOT_FOUND', 'No active negotiation exists for this quotation.');
  const canView = principal.roles.includes('admin') || editableRole(principal, item.owner_role) || item.owner_user_id === principal.id || (principal.roles.includes('sales_manager') && item.manager_forwarded_history);
  if (!canView) throw new AppError(403, 'FORBIDDEN', 'This negotiation is not assigned to you.');
  return item;
}

export async function listCases(req, res, next) {
  try {
    const roles = req.principal.roles;
    const params = [req.principal.id];
    const where = roles.includes('admin')
      ? ''
      : roles.includes('sales_manager')
        ? `WHERE (nc.owner_role='sales_manager' AND nc.status='open') OR EXISTS(SELECT 1 FROM negotiation_case_events nce WHERE nce.negotiation_case_id=nc.id AND nce.from_role='sales_manager')`
        : roles.includes('finance_operations')
          ? `WHERE nc.owner_role='finance_operations' AND nc.status='open'`
          : `WHERE q.owner_user_id=$1`;
    const { rows } = await pool.query(
      `SELECT nc.id AS case_id,nc.quotation_id,nc.owner_role,nc.status AS case_status,nc.last_handoff_reason,nc.updated_at,
              q.quote_number,q.status AS quote_status,q.current_version_number,
              c.legal_name AS customer_name,COALESCE(q.owner_display_name,u.display_name,'Removed internal user') AS owner_name,
              qv.grand_total,qv.currency_code,
              (SELECT nr.created_at FROM negotiation_requests nr WHERE nr.quotation_id=q.id ORDER BY nr.created_at DESC LIMIT 1) AS latest_request_at
       FROM negotiation_cases nc
       JOIN quotations q ON q.id=nc.quotation_id
       JOIN customers c ON c.id=q.customer_id
       LEFT JOIN users u ON u.id=q.owner_user_id
       LEFT JOIN quotation_versions qv ON qv.quotation_id=q.id AND qv.version_number=q.current_version_number
       ${where} ORDER BY nc.updated_at DESC`,
      where.includes('$1') ? params : []
    );
    res.json({ cases: rows });
  } catch (error) { next(error); }
}

export async function getCaseDetail(req, res, next) {
  try {
    const item = await getCase(pool, req.params.quoteId, req.principal);
    const quote = await getQuotationById(req.params.quoteId);
    const { rows: requests } = await pool.query(
      `SELECT nr.*,cc.display_name AS customer_name,
        COALESCE(json_agg(json_build_object('line_id',nrl.quotation_line_id,'comment',nrl.customer_comment)) FILTER(WHERE nrl.id IS NOT NULL),'[]') AS line_requests
       FROM negotiation_requests nr JOIN customer_contacts cc ON cc.id=nr.customer_contact_id
       LEFT JOIN negotiation_request_lines nrl ON nrl.negotiation_request_id=nr.id
       WHERE nr.quotation_id=$1 GROUP BY nr.id,cc.display_name ORDER BY nr.created_at ASC`, [req.params.quoteId]
    );
    const { rows: events } = await pool.query(
      `SELECT nce.*,COALESCE(u.display_name,'System') AS actor_name FROM negotiation_case_events nce LEFT JOIN users u ON u.id=nce.actor_user_id WHERE nce.negotiation_case_id=$1 ORDER BY nce.created_at ASC`, [item.id]
    );
    res.json({ case: item, quotation: quote, requests, events, can_edit: editableRole(req.principal, item.owner_role) && item.status === 'open' });
  } catch (error) { next(error); }
}

export async function reviseCase(req, res, next) {
  try {
    const result = await inTransaction(async (client) => {
      const item = await getCase(client, req.params.quoteId, req.principal, true);
      if (!editableRole(req.principal, item.owner_role) || item.status !== 'open') throw new AppError(403, 'NEGOTIATION_NOT_ACTIONABLE', 'This negotiation has been forwarded or closed.');
      const input = req.validated.body;
      if (item.lock_version !== input.expectedLockVersion) throw new AppError(409, 'QUOTE_VERSION_CONFLICT', 'Quotation was updated by another user.');
      const { rows: customers } = await client.query(`SELECT c.*,ct.code AS tier_code,COALESCE(ct.entitlement_discount_percent,0) AS entitlement_discount_percent,ct.policy_version AS tier_policy_version FROM customers c LEFT JOIN customer_tiers ct ON ct.id=c.tier_id WHERE c.id=$1`, [item.customer_id]);
      const quotation = { id: item.quotation_id };
      const { version, assessment } = await createQuoteVersion(client, { quotation, customer: customers[0], input, actorUserId: req.principal.id, versionNumber: item.current_version_number + 1 });

      // Send to customer — do NOT re-enter the internal approval loop.
      // The case stays open; it resolves when the customer accepts or the manager closes it.
      await client.query(
        `UPDATE quotations SET status='sent_to_customer',current_version_number=$1,lock_version=lock_version+1,last_activity_at=now(),updated_at=now() WHERE id=$2`,
        [version.version_number, item.quotation_id]
      );
      await client.query(`UPDATE negotiation_requests SET status='revised',resolved_at=now() WHERE quotation_id=$1 AND status='open'`, [item.quotation_id]);
      await client.query(`INSERT INTO negotiation_case_events(negotiation_case_id,event_type,actor_user_id,quotation_version_number) VALUES($1,'revised_offer_sent',$2,$3)`, [item.id,req.principal.id,version.version_number]);
      await writeAuditAndOutbox(client,{aggregateType:'quotation',aggregateId:item.quotation_id,eventType:'negotiation.revised_offer_sent',actorUserId:req.principal.id,afterState:{status:'sent_to_customer',ownerRole:item.owner_role},metadata:{versionNumber:version.version_number,caseId:item.id,blendedRiskPercent:assessment.blended_risk_percent,route:assessment.route}});
      return { version, status: 'sent_to_customer', owner_role: item.owner_role };
    });
    res.status(201).json({ data: result });
  } catch (error) { next(error); }
}

export async function forwardToFinance(req, res, next) {
  try {
    const reason = String(req.body?.reason ?? '').trim();
    if (reason.length < 3) throw new AppError(422, 'VALIDATION_ERROR', 'A handoff reason is required.');
    const result = await inTransaction(async (client) => {
      const item = await getCase(client, req.params.quoteId, req.principal, true);
      if (!editableRole(req.principal, 'sales_manager') || item.owner_role !== 'sales_manager' || item.status !== 'open') throw new AppError(403, 'FORBIDDEN', 'Only the current Manager can forward this negotiation.');
      await client.query(`UPDATE negotiation_cases SET owner_role='finance_operations',last_handoff_reason=$1,updated_at=now() WHERE id=$2`, [reason,item.id]);
      await client.query(`UPDATE negotiation_requests SET status='escalated' WHERE quotation_id=$1 AND status='open'`, [item.quotation_id]);
      await client.query(`INSERT INTO negotiation_case_events(negotiation_case_id,event_type,actor_user_id,from_role,to_role,reason,quotation_version_number) VALUES($1,'forwarded_to_finance',$2,'sales_manager','finance_operations',$3,$4)`,[item.id,req.principal.id,reason,item.current_version_number]);
      await writeAuditAndOutbox(client,{aggregateType:'quotation',aggregateId:item.quotation_id,eventType:'negotiation.forwarded_to_finance',actorUserId:req.principal.id,metadata:{caseId:item.id,reason}});
      return { owner_role:'finance_operations', status:'forwarded' };
    });
    res.json({ data: result });
  } catch (error) { next(error); }
}

export async function resolveCase(quotationId, actorUserId, client) {
  const result = await client.query(`UPDATE negotiation_cases SET status='resolved',resolved_at=now(),updated_at=now() WHERE quotation_id=$1 AND status='open' RETURNING id`, [quotationId]);
  if (result.rows[0]) await client.query(`INSERT INTO negotiation_case_events(negotiation_case_id,event_type,actor_user_id) VALUES($1,'customer_confirmed',$2)`, [result.rows[0].id,actorUserId]);
}
