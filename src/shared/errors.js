/**
 * Application error envelope.
 *
 * Single, app-wide error contract (no duplicate error systems). Every service
 * or route throws AppError with a stable machine-readable code and HTTP status;
 * the HTTP layer serializes it consistently.
 */

export class AppError extends Error {
  constructor(code, message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? 500;
    if (options.details !== undefined) this.details = options.details;
  }
}

/** Shared error factories used across domains and interfaces. */
export const Errors = {
  validation: (message, details) => new AppError('VALIDATION_ERROR', message, { status: 400, details }),
  unauthorized: (message = 'Authentication required.') => new AppError('UNAUTHORIZED', message, { status: 401 }),
  forbidden: (message = 'Forbidden.') => new AppError('FORBIDDEN', message, { status: 403 }),
  notFound: (message = 'Resource not found.') => new AppError('NOT_FOUND', message, { status: 404 }),
  staleVersion: (message = 'The resource changed concurrently; reload and retry.') =>
    new AppError('STALE_VERSION', message, { status: 409 }),
  invalidTransition: (message = 'Invalid state transition.') =>
    new AppError('INVALID_TRANSITION', message, { status: 409 }),
  conflict: (message = 'Conflict with existing state.') => new AppError('CONFLICT', message, { status: 409 }),
  insufficientStock: (message = 'Requested quantity exceeds available stock.') =>
    new AppError('INSUFFICIENT_STOCK', message, { status: 422 }),
  overAllocation: (message = 'Allocation exceeds the ordered line quantity.') =>
    new AppError('OVER_ALLOCATION', message, { status: 422 })
};

/** Normalize any thrown value into an AppError (Postgres codes mapped to HTTP). */
export function normalizeError(err) {
  if (err instanceof AppError) return err;
  if (err?.code === '23505') {
    return new AppError('CONFLICT', 'A record with these values already exists.', { status: 409 });
  }
  if (err?.code === '23503') {
    return new AppError('CONFLICT', 'Referenced record does not exist.', { status: 409 });
  }
  return new AppError('INTERNAL_ERROR', 'Internal server error.', { status: 500 });
}
