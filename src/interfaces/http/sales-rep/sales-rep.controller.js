import { inTransaction, writeAuditAndOutbox } from '../../../infrastructure/database/transaction.js';
import { pool } from '../../../infrastructure/database/pool.js';
import { AppError } from '../../../shared/http.js';
import {
  createQuoteVersion,
  quoteNumber,
  routeApproval
} from '../../../domains/sales-rep/quotation.service.js';

const INTERNAL_ROLES = ['admin', 'sales_manager', 'finance_operations'];

function canAccessQuote(request, quote) {
  return request.principal.roles.some((role) => INTERNAL_ROLES.includes(role))
    || quote.owner_user_id === request.principal.id;
}

async function quoteForAccess(client, request, quoteId, lock = false) {
  const result = await client.query(
    `SELECT * FROM quotations WHERE id = $1${lock ? ' FOR UPDATE' : ''}`,
    [quoteId]
  );
  if (!result.rows[0]) throw new AppError(404, 'QUOTE_NOT_FOUND', 'Quotation was not found.');
  if (!canAccessQuote(request, result.rows[0])) {
    throw new AppError(403, 'FORBIDDEN', 'You cannot access this quotation.');
  }
  return result.rows[0];
}

export async function listQuotations(request, response, next) {
  try {
    const internalUser = request.principal.roles.some((role) => INTERNAL_ROLES.includes(role));
    const { rows } = await pool.query(
      `SELECT q.*, c.legal_name, COALESCE(q.owner_display_name, u.display_name, 'Removed internal user') AS owner_name,
              qv.grand_total, ra.blended_risk_percent, ra.route,
              nc.owner_role AS negotiation_owner_role, nc.status AS negotiation_case_status,
              nc.last_handoff_reason, nc.updated_at AS negotiation_updated_at
       FROM quotations q
       JOIN customers c ON c.id = q.customer_id
       LEFT JOIN users u ON u.id = q.owner_user_id
       LEFT JOIN quotation_versions qv ON qv.quotation_id = q.id
         AND qv.version_number = q.current_version_number
       LEFT JOIN risk_assessments ra ON ra.quotation_version_id = qv.id
       LEFT JOIN negotiation_cases nc ON nc.quotation_id = q.id
       WHERE ($1::boolean OR q.owner_user_id = $2)
       ORDER BY q.updated_at DESC`,
      [internalUser, request.principal.id]
    );
    response.json({ data: rows });
  } catch (error) { next(error); }
}

export async function createQuotation(request, response, next) {
  try {
    const result = await inTransaction(async (client) => {
      const input = request.validated.body;
      let quoteRequest = null;
      if (input.quoteRequestId) {
        const { rows } = await client.query(
          `SELECT * FROM quote_requests WHERE id = $1 FOR UPDATE`,
          [input.quoteRequestId]
        );
        quoteRequest = rows[0];
        if (!quoteRequest) throw new AppError(404, 'QUOTE_REQUEST_NOT_FOUND', 'Quote request was not found.');
        if (quoteRequest.assigned_sales_rep_id !== request.principal.id) {
          throw new AppError(403, 'QUOTE_REQUEST_NOT_ASSIGNED', 'This quote request is assigned to another sales representative.');
        }
        if (quoteRequest.customer_id !== input.customerId) {
          throw new AppError(422, 'QUOTE_REQUEST_CUSTOMER_MISMATCH', 'The quotation customer must match the quote request.');
        }
        if (quoteRequest.status === 'converted' || quoteRequest.quotation_id) {
          throw new AppError(409, 'QUOTE_REQUEST_CONVERTED', 'A quotation has already been created for this request.');
        }
      }
      const customer = await client.query('SELECT * FROM customers WHERE id = $1', [input.customerId]);
      if (!customer.rows[0]) {
        throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Customer was not found.');
      }
      const { rows } = await client.query(
        `INSERT INTO quotations (quote_number, customer_id, owner_user_id, status, current_version_number)
         VALUES ($1, $2, $3, 'draft', 1)
         RETURNING *`,
        [quoteNumber(), input.customerId, request.principal.id]
      );
      const quote = rows[0];
      const fullCustomer = (await client.query(
        `SELECT c.*, ct.code AS tier_code, COALESCE(ct.entitlement_discount_percent, 0) AS entitlement_discount_percent,
                ct.policy_version AS tier_policy_version
         FROM customers c
         LEFT JOIN customer_tiers ct ON ct.id = c.tier_id
         WHERE c.id = $1`,
        [input.customerId]
      )).rows[0];
      const { version, assessment } = await createQuoteVersion(client, {
        quotation: quote,
        customer: fullCustomer,
        input,
        actorUserId: request.principal.id,
        versionNumber: 1
      });
      await writeAuditAndOutbox(client, {
        aggregateType: 'quotation',
        aggregateId: quote.id,
        eventType: 'quotation.created',
        actorUserId: request.principal.id,
        afterState: quote,
        metadata: { version: version.version_number, risk: assessment.blended_risk_percent }
      });
      if (quoteRequest) {
        await client.query(
          `UPDATE quote_requests
           SET status = 'converted', quotation_id = $1, converted_at = now()
           WHERE id = $2`,
          [quote.id, quoteRequest.id]
        );
        await writeAuditAndOutbox(client, {
          aggregateType: 'quote_request', aggregateId: quoteRequest.id,
          eventType: 'quote_request.converted', actorUserId: request.principal.id,
          metadata: { quotationId: quote.id, customerId: quote.customer_id }
        });
      }
      return { quote, version, assessment };
    });
    response.status(201).json({ data: result });
  } catch (error) { next(error); }
}

export async function getQuotation(request, response, next) {
  try {
    const quote = await quoteForAccess(pool, request, request.validated.params.quoteId);
    const version = (await pool.query(
      'SELECT * FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2',
      [quote.id, quote.current_version_number]
    )).rows[0];
    const lines = (await pool.query(
      `SELECT ql.*, p.sku, p.name, p.standard_cost
       FROM quotation_lines ql
       JOIN products p ON p.id = ql.product_id
       WHERE ql.quotation_version_id = $1
       ORDER BY ql.line_number`,
      [version.id]
    )).rows;
    const risk = (await pool.query(
      'SELECT * FROM risk_assessments WHERE quotation_version_id = $1',
      [version.id]
    )).rows[0];
    const approvals = (await pool.query(
      'SELECT * FROM approval_instances WHERE quotation_version_id = $1 ORDER BY sequence_number',
      [version.id]
    )).rows;
    response.json({ data: { quote, version, lines, risk, approvals } });
  } catch (error) { next(error); }
}

export async function createRevision(request, response, next) {
  try {
    const result = await inTransaction(async (client) => {
      const quote = await quoteForAccess(client, request, request.validated.params.quoteId, true);
      const input = request.validated.body;
      if (quote.lock_version !== input.expectedLockVersion) {
        throw new AppError(409, 'QUOTE_VERSION_CONFLICT', 'Quotation was updated by another user.', {
          currentLockVersion: quote.lock_version
        });
      }
      if (['paid', 'cancelled', 'expired', 'superseded'].includes(quote.status)) {
        throw new AppError(409, 'QUOTE_NOT_EDITABLE', 'This quotation cannot be revised.');
      }
      const customer = (await client.query(
        `SELECT c.*, ct.code AS tier_code, COALESCE(ct.entitlement_discount_percent, 0) AS entitlement_discount_percent,
                ct.policy_version AS tier_policy_version
         FROM customers c
         LEFT JOIN customer_tiers ct ON ct.id = c.tier_id
         WHERE c.id = $1`,
        [quote.customer_id]
      )).rows[0];
      const nextVersion = quote.current_version_number + 1;
      const { version, assessment } = await createQuoteVersion(client, {
        quotation: quote,
        customer,
        input,
        actorUserId: request.principal.id,
        versionNumber: nextVersion
      });
      await client.query(
        `UPDATE quotations
         SET current_version_number = $1, lock_version = lock_version + 1,
             status = 'draft', last_activity_at = now(), updated_at = now()
         WHERE id = $2`,
        [nextVersion, quote.id]
      );
      await client.query(
        `UPDATE approval_instances
         SET status = 'superseded'
         WHERE quotation_id = $1 AND quotation_version_id <> $2 AND status = 'pending'`,
        [quote.id, version.id]
      );
      await writeAuditAndOutbox(client, {
        aggregateType: 'quotation',
        aggregateId: quote.id,
        eventType: 'quotation.revised',
        actorUserId: request.principal.id,
        metadata: { version: nextVersion, risk: assessment.blended_risk_percent }
      });
      await client.query(`UPDATE negotiation_requests SET status='revised', resolved_at=now() WHERE quotation_id=$1 AND status='open'`, [quote.id]);
      return { version, assessment, lockVersion: quote.lock_version + 1 };
    });
    response.status(201).json({ data: result });
  } catch (error) { next(error); }
}

export async function submitQuotation(request, response, next) {
  try {
    const result = await inTransaction(async (client) => {
      const quote = await quoteForAccess(client, request, request.validated.params.quoteId, true);
      const version = (await client.query(
        'SELECT * FROM quotation_versions WHERE quotation_id = $1 AND version_number = $2',
        [quote.id, quote.current_version_number]
      )).rows[0];
      const assessment = (await client.query(
        'SELECT * FROM risk_assessments WHERE quotation_version_id = $1',
        [version.id]
      )).rows[0];
      if (!version || !assessment) {
        throw new AppError(409, 'QUOTE_NOT_READY', 'Quotation needs a current version and risk assessment.');
      }
      const status = await routeApproval(client, {
        quotation: quote,
        version,
        assessment,
        actorUserId: request.principal.id
      });
      return { quoteId: quote.id, versionNumber: version.version_number, status, assessment };
    });
    response.json({ data: result });
  } catch (error) { next(error); }
}

export async function getTimeline(request, response, next) {
  try {
    const quote = await quoteForAccess(pool, request, request.validated.params.quoteId);
    const { rows } = await pool.query(
      'SELECT * FROM audit_events WHERE quotation_id = $1 ORDER BY occurred_at DESC',
      [quote.id]
    );
    response.json({ data: rows });
  } catch (error) { next(error); }
}

export async function listQuoteRequests(request,response,next){try{const {rows}=await pool.query(`SELECT qr.id,qr.customer_id,qr.message,qr.status,qr.created_at,qr.assigned_at,qr.quotation_id,qr.converted_at,cc.email AS contact_email,cc.display_name AS contact_name,c.legal_name AS customer_name,q.quote_number, q.status AS quotation_status FROM quote_requests qr JOIN customer_contacts cc ON cc.id=qr.contact_id JOIN customers c ON c.id=qr.customer_id LEFT JOIN quotations q ON q.id=qr.quotation_id WHERE qr.assigned_sales_rep_id=$1 ORDER BY qr.created_at DESC`,[request.principal.id]);response.json({requests:rows});}catch(error){next(error);}}

export async function getNegotiationRequests(request, response, next) {
  try {
    const quote = await quoteForAccess(pool, request, request.validated.params.quoteId);
    const { rows } = await pool.query(`SELECT nr.id,nr.status,nr.counter_discount_percent,nr.requested_delivery_date,nr.risk_preview_percent,nr.risk_preview_route,nr.created_at,cc.display_name AS customer_name,
      COALESCE(json_agg(json_build_object('lineId',nrl.quotation_line_id,'comment',nrl.customer_comment)) FILTER (WHERE nrl.id IS NOT NULL),'[]') AS line_requests
      FROM negotiation_requests nr JOIN customer_contacts cc ON cc.id=nr.customer_contact_id LEFT JOIN negotiation_request_lines nrl ON nrl.negotiation_request_id=nr.id
      WHERE nr.quotation_id=$1 GROUP BY nr.id,cc.display_name ORDER BY nr.created_at DESC`, [quote.id]);
    response.json({ data: rows });
  } catch (error) { next(error); }
}

export async function sendToCustomer(request, response, next) {
  try {
    const result = await inTransaction(async (client) => {
      const quote = await quoteForAccess(client, request, request.validated.params.quoteId, true);
      if (quote.status !== 'approved') {
        throw new AppError(409, 'INVALID_STATUS', `Cannot send quotation with status '${quote.status}' to customer. Expected: approved.`);
      }
      await client.query(
        `UPDATE quotations SET status='sent_to_customer', lock_version=lock_version+1, last_activity_at=now(), updated_at=now() WHERE id=$1`,
        [quote.id]
      );
      await writeAuditAndOutbox(client, {
        aggregateType: 'quotation', aggregateId: quote.id,
        eventType: 'quotation.sent_to_customer',
        actorUserId: request.principal.id,
        beforeState: { status: quote.status },
        afterState: { status: 'sent_to_customer' },
        metadata: { quotationId: quote.id },
      });
      return { status: 'sent_to_customer', lockVersion: quote.lock_version + 1 };
    });
    response.json({ data: result });
  } catch (error) { next(error); }
}

export async function acceptUpsell(request, response, next) {
  try {
    const { suggestionProductId, quantity = 1, expectedLockVersion } = request.body ?? {};
    if (!suggestionProductId) throw new AppError(422, 'MISSING_FIELD', 'suggestionProductId is required.');
    const result = await inTransaction(async (client) => {
      const quote = await quoteForAccess(client, request, request.validated.params.quoteId, true);
      if (typeof expectedLockVersion === 'number' && quote.lock_version !== expectedLockVersion) {
        throw new AppError(409, 'QUOTE_VERSION_CONFLICT', 'Quotation was updated by another user.');
      }
      if (['paid', 'cancelled', 'expired', 'superseded'].includes(quote.status)) {
        throw new AppError(409, 'QUOTE_NOT_EDITABLE', 'This quotation cannot be revised.');
      }
      const customer = (await client.query(
        `SELECT c.*, ct.code AS tier_code, COALESCE(ct.entitlement_discount_percent,0) AS entitlement_discount_percent,
                ct.policy_version AS tier_policy_version
         FROM customers c LEFT JOIN customer_tiers ct ON ct.id=c.tier_id WHERE c.id=$1`,
        [quote.customer_id]
      )).rows[0];
      const version = (await client.query(
        'SELECT * FROM quotation_versions WHERE quotation_id=$1 AND version_number=$2',
        [quote.id, quote.current_version_number]
      )).rows[0];
      const existingLines = (await client.query(
        `SELECT product_id, quantity, COALESCE(line_discount_percent,0) AS line_discount_percent, product_variant_id
         FROM quotation_lines WHERE quotation_version_id=$1 ORDER BY line_number`,
        [version.id]
      )).rows;
      if (existingLines.some(l => l.product_id === suggestionProductId)) {
        throw new AppError(409, 'ALREADY_IN_QUOTE', 'This product is already on the quotation.');
      }
      const lines = [
        ...existingLines.map(l => ({
          productId: l.product_id,
          productVariantId: l.product_variant_id ?? undefined,
          quantity: parseFloat(l.quantity),
          lineDiscountPercent: parseFloat(l.line_discount_percent),
        })),
        { productId: suggestionProductId, quantity: parseFloat(quantity), lineDiscountPercent: 0 },
      ];
      const nextVersion = quote.current_version_number + 1;
      const { version: newVersion, assessment } = await createQuoteVersion(client, {
        quotation: quote, customer,
        input: { customerId: quote.customer_id, discountMode: 'line', currencyCode: version.currency_code, reason: 'Upsell accepted', lines },
        actorUserId: request.principal.id,
        versionNumber: nextVersion,
      });
      await client.query(
        `UPDATE quotations SET current_version_number=$1, lock_version=lock_version+1, status='draft', last_activity_at=now(), updated_at=now() WHERE id=$2`,
        [nextVersion, quote.id]
      );
      await client.query(
        `UPDATE approval_instances SET status='superseded' WHERE quotation_id=$1 AND status='pending'`,
        [quote.id]
      );
      await writeAuditAndOutbox(client, {
        aggregateType: 'quotation', aggregateId: quote.id,
        eventType: 'quotation.upsell_accepted',
        actorUserId: request.principal.id,
        metadata: { suggestionProductId, quantity, newVersion: nextVersion, grandTotal: newVersion.grand_total },
      });
      return { version: newVersion, assessment, lockVersion: quote.lock_version + 1 };
    });
    response.status(201).json({ data: result });
  } catch (error) { next(error); }
}

export async function getDealHealth(request, response, next) {
  try {
    const quote = await quoteForAccess(pool, request, request.validated.params.quoteId);
    const { rows } = await pool.query(
      `SELECT * FROM deal_health_assessments
       WHERE quotation_id = $1
       ORDER BY assessed_at DESC
       LIMIT 1`,
      [quote.id]
    );
    response.json({ data: rows[0] ?? null });
  } catch (error) { next(error); }
}
