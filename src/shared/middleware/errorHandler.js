export function errorHandler(err, req, res, _next) {
  const status = err.status ?? 500;
  const message = err.message ?? 'Internal server error';

  if (status === 500) {
    console.error(`[${req.method} ${req.path}]`, err);
  }

  const body = { error: message };
  if (err.details) body.details = err.details;

  res.status(status).json(body);
}
