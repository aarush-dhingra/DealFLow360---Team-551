import { validate, validateQuery } from '../../../shared/http/validate.js';
import { ok, created } from '../../../shared/http/response.js';
import { NotFoundError } from '../../../shared/http/errors.js';
import { pool } from '../../../infrastructure/database/pool.js';
import {
  counterOfferSchema,
  acceptQuoteSchema,
  listQuotesQuerySchema,
  threadQuerySchema
  , structuredNegotiationSchema
} from './schemas.js';
import {
  listPortalQuotes,
  getPortalQuotation,
  getPortalVersion
} from '../../../domains/customer-portal/quotation.repository.js';
import { getTierProgress } from '../../../domains/customer-portal/quotation.repository.js';
import { getThread } from '../../../domains/customer-portal/negotiation.repository.js';
import { acceptQuote, submitCounter } from '../../../domains/customer-portal/quotation.service.js';

export function health(_req, res) {
  res.json({ status: 'customer portal online' });
}

export async function tierProgress(req, res, next) {
  try {
    const progress = await getTierProgress(req.user.email);
    if (!progress) throw new NotFoundError('Customer profile');
    ok(res, { tier: progress });
  } catch (err) { next(err); }
}

export async function listQuotes(req, res, next) {
  try {
    const { status, limit, offset } = validateQuery(listQuotesQuerySchema, req.query);
    const result = await listPortalQuotes(req.user.email, { status, limit, offset });
    ok(res, { quotes: result.quotes, total: result.quotes.length });
  } catch (err) { next(err); }
}

export async function getQuote(req, res, next) {
  try {
    const result = await getPortalQuotation(req.user.email, req.params.id);
    if (!result) throw new NotFoundError('Quote');
    ok(res, { quote: result.quote });
  } catch (err) { next(err); }
}

export async function getVersion(req, res, next) {
  try {
    const versionNumber = parseInt(req.params.n, 10);
    if (!Number.isFinite(versionNumber) || versionNumber < 1) {
      throw new NotFoundError('Version');
    }
    const version = await getPortalVersion(req.user.email, req.params.id, versionNumber);
    if (!version) throw new NotFoundError('Version');
    ok(res, { version });
  } catch (err) { next(err); }
}

export async function getMessages(req, res, next) {
  try {
    const result = await getPortalQuotation(req.user.email, req.params.id);
    if (!result) throw new NotFoundError('Quote');
    const { limit, offset } = validateQuery(threadQuerySchema, req.query);
    const messages = await getThread(req.params.id, { limit, offset });
    ok(res, { messages });
  } catch (err) { next(err); }
}

export async function acceptQuotation(req, res, next) {
  try {
    const { lock_version } = validate(acceptQuoteSchema, req.body);
    const quoteCheck = await getPortalQuotation(req.user.email, req.params.id);
    if (!quoteCheck) throw new NotFoundError('Quote');
    const result = await acceptQuote(req.user.email, req.params.id, lock_version, quoteCheck.customerId);
    const { resolveCase } = await import('../negotiations/negotiation.controller.js');
    await import('../../../infrastructure/database/transaction.js').then(({ inTransaction }) => inTransaction((client) => resolveCase(req.params.id, null, client)));
    ok(res, result);
  } catch (err) { next(err); }
}

export async function submitCounterOffer(req, res, next) {
  try {
    const data = validate(counterOfferSchema, req.body);
    const quoteCheck = await getPortalQuotation(req.user.email, req.params.id);
    if (!quoteCheck) throw new NotFoundError('Quote');
    const result = await submitCounter(
      req.user.email,
      req.params.id,
      data.lock_version,
      quoteCheck.customerId,
      {
        messageText: data.message_text,
        requestedDiscountPercent: data.requested_discount_percent,
        lineId: data.line_id
      }
    );
    created(res, result);
  } catch (err) { next(err); }
}

export async function getNegotiationRequests(req, res, next) {
  try {
    const quoteCheck = await getPortalQuotation(req.user.email, req.params.id);
    if (!quoteCheck) throw new NotFoundError('Quote');
    const { rows } = await pool.query(
      `SELECT nr.id, nr.status, nr.counter_discount_percent, nr.requested_delivery_date,
              nr.risk_preview_percent, nr.risk_preview_route, nr.created_at,
              COALESCE(
                json_agg(json_build_object(
                  'line_id', nrl.quotation_line_id,
                  'product_name', COALESCE(p.name, ql.description),
                  'comment', nrl.customer_comment
                )) FILTER (WHERE nrl.id IS NOT NULL),
                '[]'
              ) AS line_requests
       FROM negotiation_requests nr
       LEFT JOIN negotiation_request_lines nrl ON nrl.negotiation_request_id = nr.id
       LEFT JOIN quotation_lines ql ON ql.id = nrl.quotation_line_id
       LEFT JOIN products p ON p.id = ql.product_id
       WHERE nr.quotation_id = $1
       GROUP BY nr.id
       ORDER BY nr.created_at ASC`,
      [quoteCheck.quote.id]
    );
    ok(res, { requests: rows });
  } catch (err) { next(err); }
}

export async function submitStructuredNegotiation(req, res, next) {
  try {
    const input = validate(structuredNegotiationSchema, req.body);
    const portalQuote = await getPortalQuotation(req.user.email, req.params.id);
    if (!portalQuote) throw new NotFoundError('Quote');

    const { rows: contacts } = await pool.query(
      'SELECT id FROM customer_contacts WHERE customer_id=$1 AND email=$2',
      [portalQuote.customerId, req.user.email]
    );
    if (!contacts[0]) throw new NotFoundError('Customer contact');

    const { inTransaction, writeAuditAndOutbox } = await import('../../../infrastructure/database/transaction.js');
    const output = await inTransaction(async (client) => {
      const { rows } = await client.query(
        `SELECT q.*, qv.id AS version_id
         FROM quotations q
         JOIN quotation_versions qv ON qv.quotation_id=q.id AND qv.version_number=q.current_version_number
         WHERE q.id=$1 FOR UPDATE`,
        [req.params.id]
      );
      const quote = rows[0];
      if (!quote || !['sent_to_customer', 'approved', 'under_negotiation'].includes(quote.status)) {
        throw new Error('Quote is not open for negotiation.');
      }
      if (quote.lock_version !== input.lock_version) throw new Error('Quote changed. Refresh and try again.');

      const lines = (await client.query(
        'SELECT id,line_base_value,allowed_discount_percent FROM quotation_lines WHERE quotation_version_id=$1',
        [quote.version_id]
      )).rows;
      for (const requestLine of input.line_requests) {
        if (!lines.some((line) => line.id === requestLine.line_id)) {
          throw new Error('A requested line is not on this quotation.');
        }
      }

      const discount = input.counter_discount_percent ?? 0;
      const total = lines.reduce((sum, line) => sum + Number(line.line_base_value), 0);
      const excess = lines.reduce(
        (sum, line) => sum + Number(line.line_base_value) * Math.max(0, discount - Number(line.allowed_discount_percent)) / 100,
        0
      );
      const risk = total ? excess / total * 100 : 0;
      const policy = (await client.query(
        'SELECT * FROM approval_policies WHERE is_active ORDER BY policy_version DESC LIMIT 1'
      )).rows[0];
      const route = risk === 0 ? 'none' : risk <= Number(policy.manager_max_blended_risk_percent) ? 'manager' : 'manager_then_finance';
      const proposedOwnerRole = risk === 0 ? 'sales_rep' : 'sales_manager';

      const request = (await client.query(
        `INSERT INTO negotiation_requests(quotation_id,quotation_version_id,customer_contact_id,counter_discount_percent,requested_delivery_date,risk_preview_percent,risk_preview_route)
         VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [quote.id, quote.version_id, contacts[0].id, input.counter_discount_percent ?? null, input.requested_delivery_date ?? null, risk, route]
      )).rows[0];
      for (const requestLine of input.line_requests) {
        await client.query(
          'INSERT INTO negotiation_request_lines(negotiation_request_id,quotation_line_id,customer_comment) VALUES($1,$2,$3)',
          [request.id, requestLine.line_id, requestLine.comment]
        );
      }

      // Once a case has been handed to a manager or finance, a later customer
      // message stays with that owner rather than silently returning to Sales.
      const { rows: caseRows } = await client.query(
        `INSERT INTO negotiation_cases(quotation_id,owner_role,status,updated_at)
         VALUES($1,$2,'open',now())
         ON CONFLICT(quotation_id) DO UPDATE SET
           owner_role=CASE WHEN negotiation_cases.status='open' THEN negotiation_cases.owner_role ELSE EXCLUDED.owner_role END,
           status='open', updated_at=now()
         RETURNING id,owner_role`,
        [quote.id, proposedOwnerRole]
      );
      const negotiationCase = caseRows[0];
      await client.query(
        `INSERT INTO negotiation_case_events(negotiation_case_id,event_type,from_role,to_role,quotation_version_number)
         VALUES($1,'customer_request_received',NULL,$2,$3)`,
        [negotiationCase.id, negotiationCase.owner_role, quote.current_version_number]
      );
      await client.query(
        `UPDATE quotations SET status='under_negotiation',lock_version=lock_version+1,last_activity_at=now(),updated_at=now() WHERE id=$1`,
        [quote.id]
      );
      await writeAuditAndOutbox(client, {
        aggregateType: 'quotation', aggregateId: quote.id, eventType: 'negotiation.requested', actorUserId: null,
        beforeState: { status: quote.status }, afterState: { status: 'under_negotiation' },
        metadata: { quotationId: quote.id, negotiationRequestId: request.id, riskPreviewPercent: risk, riskPreviewRoute: route, ownerRole: negotiationCase.owner_role }
      });
      return { ...request, status: 'under_negotiation', owner_role: negotiationCase.owner_role };
    });
    created(res, { request: output });
  } catch (err) { next(err); }
}

export async function createQuoteRequest(req, res, next) {
  try {
    const message = req.body?.message?.trim();
    if (!message) return res.status(400).json({ error: 'Message is required' });

    const { rows: contacts } = await pool.query(
      'SELECT id, customer_id FROM customer_contacts WHERE email = $1 LIMIT 1',
      [req.user.email]
    );
    const contact = contacts[0];
    if (!contact) throw new NotFoundError('Customer contact');

    const { inTransaction, writeAuditAndOutbox } = await import('../../../infrastructure/database/transaction.js');
    const request = await inTransaction(async (client) => {
      const { rows: reps } = await client.query(`SELECT u.id FROM users u JOIN user_roles ur ON ur.user_id=u.id AND ur.role='sales_rep' WHERE u.is_active ORDER BY (SELECT count(*) FROM quote_requests qr WHERE qr.assigned_sales_rep_id=u.id AND qr.status IN ('pending','viewed')) ASC,u.created_at ASC LIMIT 1`);
      if (!reps[0]) throw new Error('No active sales representative is available.');
      const { rows } = await client.query(`INSERT INTO quote_requests (customer_id,contact_id,message,assigned_sales_rep_id,assigned_at) VALUES ($1,$2,$3,$4,now()) RETURNING id,message,status,created_at,assigned_sales_rep_id`,[contact.customer_id,contact.id,message,reps[0].id]);
      await writeAuditAndOutbox(client,{aggregateType:'quote_request',aggregateId:rows[0].id,eventType:'quote_request.assigned_to_sales_rep',actorUserId:null,afterState:rows[0],metadata:{customerId:contact.customer_id,assignedSalesRepId:reps[0].id}});
      return rows[0];
    });
    created(res, { request });
  } catch (err) { next(err); }
}

export async function listMyQuoteRequests(req, res, next) {
  try {
    const { rows: contacts } = await pool.query(
      'SELECT customer_id FROM customer_contacts WHERE email = $1 LIMIT 1',
      [req.user.email]
    );
    if (!contacts[0]) return ok(res, { requests: [] });

    const { rows } = await pool.query(
      `SELECT id, message, status, created_at FROM quote_requests
       WHERE customer_id = $1 ORDER BY created_at DESC`,
      [contacts[0].customer_id]
    );
    ok(res, { requests: rows });
  } catch (err) { next(err); }
}
