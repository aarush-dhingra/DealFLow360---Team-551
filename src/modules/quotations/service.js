import { NotFoundError } from '../../shared/errors.js';
import * as repo from './repository.js';

export async function listQuotations(filters) {
  return repo.listQuotations(filters);
}

export async function getQuotation(id) {
  const quote = await repo.getQuotationById(id);
  if (!quote) throw new NotFoundError('Quotation');
  return quote;
}

export async function getQuotationVersion(quotationId, versionNumber) {
  const version = await repo.getQuotationVersion(quotationId, versionNumber);
  if (!version) throw new NotFoundError('Quotation version');
  return version;
}

export async function getQuotationAudit(quotationId) {
  const quote = await repo.getQuotationById(quotationId);
  if (!quote) throw new NotFoundError('Quotation');
  return repo.getQuotationAudit(quotationId);
}
