const { logLine } = require('../lib/structuredLog');

/**
 * Logs one JSON line per finished response (method, path, status, duration, requestId).
 * Mount after requestId middleware on the same router.
 */
function apiAccessLog(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    let level = 'info';
    if (res.statusCode === 429) level = 'warn';
    else if (res.statusCode >= 500) level = 'error';
    else if (res.statusCode >= 400) level = 'info';

    logLine({
      level,
      tag: 'api_access',
      requestId: req.id ?? null,
      method: req.method,
      path: pathOnly,
      status: res.statusCode,
      ms: Date.now() - start,
    });
  });
  next();
}

module.exports = apiAccessLog;
