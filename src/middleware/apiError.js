/**
 * API error handling for /api/** routes.
 * Ensures JSON responses; does not affect EJS pages.
 */

class ApiError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

function apiErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  // Mounted routers use req.baseUrl (e.g. '/api'); req.path is only the suffix (e.g. '/payments/start').
  const pathNoQuery = (req.originalUrl || req.url || '').split('?')[0];
  const isApiRoute = pathNoQuery.startsWith('/api') || (req.baseUrl || '').startsWith('/api');
  if (!isApiRoute) return next(err);

  if (process.env.NODE_ENV !== 'production' && !(err instanceof ApiError)) {
    console.error('[api]', req.method, pathNoQuery, err);
  }

  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      ok: false,
      error: err.code,
      message: err.message,
      details: err.details ?? undefined,
    });
  }

  const statusCode = err.statusCode ?? 500;
  res.status(statusCode).json({
    ok: false,
    error: 'INTERNAL_ERROR',
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
}

module.exports = { ApiError, asyncHandler, apiErrorHandler };
