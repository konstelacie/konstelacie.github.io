/**
 * Adaptive captcha (docs/security/captcha.md).
 * CAPTCHA_MODE=off — no recording (default).
 * CAPTCHA_MODE=shadow — record velocity, log when captcha would have been required.
 * CAPTCHA_MODE=enforce — same + block with captcha_required until valid token.
 */

const { logLine } = require('./structuredLog');
const config = require('../config');

const WINDOW_MS = 5 * 60 * 1000;
/** POST /api/slots/:slotId/lock — strong signal: burst of lock attempts. */
const LOCK_THRESHOLD = 25;
/** POST /api/payments/start — reservation/checkout step; burst of starts from one IP. */
const PAYMENT_START_THRESHOLD = 20;

const ROUTE_LOCK = 'lock';
const ROUTE_PAYMENT_START = 'payment_start';

/** @type {Map<string, number[]>} */
const buckets = new Map();

function getMode() {
  const m = String(config.captcha?.mode || 'off').toLowerCase();
  if (m === 'shadow' || m === 'enforce') return m;
  return 'off';
}

function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  return String(raw);
}

function bucketKey(ip, route) {
  return `${route}:${ip}`;
}

function prune(tsList, now) {
  const cutoff = now - WINDOW_MS;
  while (tsList.length && tsList[0] < cutoff) {
    tsList.shift();
  }
}

function recordAttempt(ip, route) {
  const key = bucketKey(ip, route);
  const now = Date.now();
  let tsList = buckets.get(key);
  if (!tsList) {
    tsList = [];
    buckets.set(key, tsList);
  }
  prune(tsList, now);
  tsList.push(now);
}

/**
 * Whether captcha would be required based on recent write attempts (risk layer).
 * @param {string} ip
 * @param {'lock'|'payment_start'} route
 */
function shouldRequireCaptcha(ip, route) {
  const key = bucketKey(ip, route);
  const now = Date.now();
  const tsList = buckets.get(key);
  if (!tsList) return false;
  prune(tsList, now);
  const threshold = route === ROUTE_LOCK ? LOCK_THRESHOLD : PAYMENT_START_THRESHOLD;
  return tsList.length >= threshold;
}

function extractCaptchaToken(body) {
  if (!body || typeof body !== 'object') return '';
  const t = body.captchaToken ?? body.captcha_token;
  return typeof t === 'string' ? t.trim() : '';
}

/**
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function verifyRecaptchaToken(token) {
  const secret = config.captcha?.secret || '';
  if (!secret || !token) return false;

  const params = new URLSearchParams();
  params.set('secret', secret);
  params.set('response', token);

  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    if (!r.ok) return false;
    const data = await r.json();
    if (data.success !== true) return false;
    if (typeof data.score === 'number') {
      const min = config.captcha?.minScore ?? 0.5;
      return data.score >= min;
    }
    return true;
  } catch (e) {
    console.error('[captcha] siteverify failed', e);
    return false;
  }
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {{ route: 'lock'|'payment_start', slotId?: number }} ctx
 * @returns {Promise<{ proceed: true } | { proceed: false, status: number, body: object }>}
 */
async function handleCaptchaGate(req, res, ctx) {
  const mode = getMode();
  if (mode === 'off') {
    return { proceed: true };
  }

  const ip = clientIp(req);
  const { route, slotId } = ctx;

  recordAttempt(ip, route);
  const need = shouldRequireCaptcha(ip, route);

  if (!need) {
    return { proceed: true };
  }

  if (mode === 'shadow') {
    logLine({
      level: 'info',
      tag: 'captcha_would_require',
      requestId: req.id ?? null,
      route,
      slotId: slotId != null ? slotId : null,
      ip,
    });
    return { proceed: true };
  }

  const secret = config.captcha?.secret || '';
  if (!secret) {
    console.warn('[captcha] CAPTCHA_MODE=enforce but RECAPTCHA_SECRET_KEY is not set; allowing request');
    return { proceed: true };
  }

  const token = extractCaptchaToken(req.body);
  if (!token) {
    logLine({
      level: 'info',
      tag: 'captcha_required_response',
      requestId: req.id ?? null,
      route,
      slotId: slotId != null ? slotId : null,
      ip,
    });
    return {
      proceed: false,
      status: 403,
      body: { ok: false, error: 'captcha_required' },
    };
  }

  const verified = await verifyRecaptchaToken(token);
  if (!verified) {
    logLine({
      level: 'info',
      tag: 'captcha_failed',
      requestId: req.id ?? null,
      route,
      slotId: slotId != null ? slotId : null,
      ip,
    });
    return {
      proceed: false,
      status: 403,
      body: { ok: false, error: 'request_cannot_be_completed' },
    };
  }

  logLine({
    level: 'info',
    tag: 'captcha_passed',
    requestId: req.id ?? null,
    route,
    slotId: slotId != null ? slotId : null,
    ip,
  });
  return { proceed: true };
}

module.exports = {
  handleCaptchaGate,
  ROUTE_LOCK,
  ROUTE_PAYMENT_START,
};
