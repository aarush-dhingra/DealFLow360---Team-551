import { NotFoundError } from '../../shared/errors.js';
import * as repo from './repository.js';

export async function listTiers() {
  return repo.getTiers();
}

export async function setTierEntitlement(code, percent, actorUserId) {
  const updated = await repo.updateTierEntitlement(code, percent, actorUserId);
  if (!updated) throw new NotFoundError('Customer tier');
  return updated;
}

export async function listCategories() {
  return repo.getCategories();
}

export async function setCategoryCeiling(code, percent, actorUserId) {
  const updated = await repo.updateCategoryCeiling(code, percent, actorUserId);
  if (!updated) throw new NotFoundError('Product category');
  return updated;
}

export async function getApprovalPolicy() {
  return repo.getActiveApprovalPolicy();
}

export async function setApprovalPolicy(managerMax, highRiskRoute, actorUserId) {
  return repo.upsertApprovalPolicy(managerMax, highRiskRoute, actorUserId);
}

export async function getDealHealthPolicy() {
  return repo.getActiveDealHealthPolicy();
}
