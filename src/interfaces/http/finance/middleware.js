/**
 * Finance HTTP middleware.
 *
 * Authorization is adapted to the authenticated request.principal set by the
 * application identity layer (no header-based dev authentication here):
 *   request.principal = { userId, roles: ['finance_operations', ...], ... }
 */

import { Errors } from '../../../shared/errors.js';

/** Require an authenticated principal. */
export function requirePrincipal(req, _res, next) {
  if (!req.principal?.userId) {
    return next(Errors.unauthorized());
  }
  return next();
}

/** Require the principal to hold at least one of the given roles. */
export function requireAnyRole(...roles) {
  return (req, _res, next) => {
    if (!req.principal?.userId) return next(Errors.unauthorized());
    const allowed = req.principal.roles ?? [];
    if (!roles.some((role) => allowed.includes(role))) {
      return next(Errors.forbidden(`Requires one of roles: ${roles.join(', ')}`));
    }
    return next();
  };
}

/** Finance/Operations role guard for Finance-owned mutations. */
export const requireFinance = requireAnyRole('finance_operations');

/** Manager may view finance read surfaces but not mutate them. */
export const requireFinanceOrManager = requireAnyRole('finance_operations', 'sales_manager');

/**
 * Wrap an async route handler so rejected promises reach the error middleware.
 */
export function asyncHandler(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

/** Express error middleware producing the stable envelope. */
export function errorHandler(err, _req, res, _next) {
  const status = err?.status ?? 500;
  const code = err?.code ?? 'INTERNAL_ERROR';
  const message = status >= 500 ? 'Internal server error' : err.message;
  res.status(status).json({ error: { code, message } });
}
