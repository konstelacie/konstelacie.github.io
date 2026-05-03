const crypto = require('crypto');
const config = require('../config');
const { logLine } = require('../lib/structuredLog');

/**
 * Constant-time string compare for UTF-8 secrets (same length only).
 * @param {string} provided
 * @param {string} expected
 */
function secretsEqual(provided, expected) {
  try {
    const a = Buffer.from(provided, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || a.length === 0) {
      return false;
    }
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Requires `X-Cron-Secret` to match `config.cronSecret`. No session cookies.
 * 503 if CRON_SECRET is not configured; 401 if header missing or wrong.
 */
function requireCronSecret(req, res, next) {
  const expected = config.cronSecret;
  if (!expected) {
    logLine({ level: 'warn', tag: 'cron_secret_not_configured' });
    return res.status(503).json({ error: 'CRON_NOT_CONFIGURED' });
  }

  const headerVal = req.get('X-Cron-Secret');
  const provided = headerVal != null ? String(headerVal).trim() : '';

  if (!secretsEqual(provided, expected)) {
    logLine({ level: 'warn', tag: 'cron_unauthorized', ip: req.ip });
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }

  return next();
}

module.exports = { requireCronSecret };
