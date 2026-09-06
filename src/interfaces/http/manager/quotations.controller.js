import * as quotationsSvc from '../../../domains/quotations/service.js';
import * as riskSvc from '../../../domains/risk/service.js';
import { pool } from '../../../infrastructure/database/pool.js';

export async function listQuotations(req, res, next) {
  try {
    const { status, owner_id, customer_id, limit, offset } = req.query;
    const all = await quotationsSvc.listQuotations({
      status,
      ownerId: owner_id,
      customerId: customer_id,
      limit: limit ? Number(limit) : 50,
      offset: offset ? Number(offset) : 0
    });
    let quotes = all;
    if (!req.user.roles.includes('admin')) {
      const role = req.user.roles.includes('sales_manager') ? 'sales_manager' : 'finance_operations';
      const { rows } = await pool.query(`SELECT DISTINCT nc.quotation_id FROM negotiation_cases nc WHERE (nc.owner_role=$1 AND nc.status='open') OR ($1='sales_manager' AND EXISTS(SELECT 1 FROM negotiation_case_events nce WHERE nce.negotiation_case_id=nc.id AND nce.from_role='sales_manager')) UNION SELECT DISTINCT quotation_id FROM approval_instances WHERE required_role=$1 AND status='pending'`, [role]);
      const ids = new Set(rows.map((row) => row.quotation_id));
      quotes = all.filter((quote) => ids.has(quote.id));
    }
    res.json({ quotations: quotes, count: quotes.length });
  } catch (err) { next(err); }
}

export async function getQuotation(req, res, next) {
  try {
    res.json({ quotation: await quotationsSvc.getQuotation(req.params.id) });
  } catch (err) { next(err); }
}

export async function getQuotationVersion(req, res, next) {
  try {
    const version = await quotationsSvc.getQuotationVersion(
      req.params.id, Number(req.params.versionNumber)
    );
    res.json({ version });
  } catch (err) { next(err); }
}

export async function getQuotationAudit(req, res, next) {
  try {
    const events = await quotationsSvc.getQuotationAudit(req.params.id);
    res.json({ audit_events: events });
  } catch (err) { next(err); }
}

export async function getQuotationRisk(req, res, next) {
  try {
    res.json({ risk: await riskSvc.getRiskForQuotation(req.params.quotationId) });
  } catch (err) { next(err); }
}

export async function listQuoteRequests(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT qr.id, qr.message, qr.status, qr.created_at,
              cc.email AS contact_email, cc.display_name AS contact_name,
              c.legal_name AS customer_name
       FROM quote_requests qr
       JOIN customer_contacts cc ON cc.id = qr.contact_id
       JOIN customers c ON c.id = qr.customer_id
       ORDER BY qr.created_at DESC`
    );
    res.json({ requests: rows });
  } catch (err) { next(err); }
}
