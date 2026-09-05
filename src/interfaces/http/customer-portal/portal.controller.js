import { validate, validateQuery } from '../../../shared/http/validate.js';
import { ok, created } from '../../../shared/http/response.js';
import { NotFoundError } from '../../../shared/http/errors.js';
import {
  counterOfferSchema,
  acceptQuoteSchema,
  listQuotesQuerySchema,
  threadQuerySchema
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
