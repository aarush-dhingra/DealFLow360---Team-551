export class AppError extends Error {
  constructor(status, code, message, details = undefined) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function notFoundHandler(request, _response, next) {
  next(new AppError(404, 'NOT_FOUND', `No route for ${request.method} ${request.path}`));
}

export function errorHandler(error, request, response, _next) {
  const status = error instanceof AppError ? error.status : 500;
  if (status >= 500) console.error(error);
  response.status(status).json({
    error: {
      code: error instanceof AppError ? error.code : 'INTERNAL_ERROR',
      message: error instanceof AppError ? error.message : 'Unexpected server error.',
      ...(error instanceof AppError && error.details ? { details: error.details } : {}),
      requestId: request.id
    }
  });
}

export function validate(schema, location = 'body') {
  return (request, _response, next) => {
    const result = schema.safeParse(request[location]);
    if (!result.success) {
      return next(new AppError(422, 'VALIDATION_ERROR', 'Request validation failed.', result.error.flatten()));
    }
    request.validated = { ...(request.validated ?? {}), [location]: result.data };
    return next();
  };
}
