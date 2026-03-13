/**
 * Cron endpoint for scheduled jobs.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 *
 * Auth: CRON_SECRET required in production. On localhost in development,
 * unauthenticated requests are allowed for easy browser testing.
 */

const express = require('express');
const config = require('../../config');
const { runAll } = require('../../jobs');
const { asyncHandler } = require('../../middleware/apiError');

const router = express.Router();

function isLocalhost(req) {
  const host = req.get('host') || req.hostname || '';
  return host.startsWith('localhost') || host.startsWith('127.0.0.1');
}

function isDevLocalhost(req) {
  return config.env === 'development' && isLocalhost(req);
}

function hasValidSecret(req) {
  const secret =
    req.get('Authorization')?.replace(/^Bearer\s+/i, '') ||
    req.get('X-Cron-Secret') ||
    req.query?.secret ||
    '';
  return config.cron.secret && secret === config.cron.secret;
}

function isAuthorized(req) {
  return isDevLocalhost(req) || hasValidSecret(req);
}

router.post(
  '/run',
  asyncHandler(async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing CRON_SECRET',
      });
    }

    const result = await runAll();
    res.json(result);
  })
);

// GET also supported for browser testing and alwaysdata (if it only supports GET)
router.get(
  '/run',
  asyncHandler(async (req, res) => {
    if (!isAuthorized(req)) {
      return res.status(401).json({
        ok: false,
        error: 'UNAUTHORIZED',
        message: 'Invalid or missing CRON_SECRET',
      });
    }

    const result = await runAll();
    res.json(result);
  })
);

module.exports = router;
