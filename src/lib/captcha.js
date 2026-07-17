/**
 * Adaptive captcha (docs/security/captcha.md).
 * CAPTCHA_MODE=off — no recording (default).
 * CAPTCHA_MODE=shadow — record velocity, log when captcha would have been required.
 * CAPTCHA_MODE=enforce — same + block with captcha_required until valid token.
 */

const { logLine } = require('./structuredLog');
const config = require('../config');

const ROUTE_LOCK = 'lock';
const ROUTE_PAYMENT_START = 'payment_start';
const ROUTE_ASSESSMENT_SUBMIT = 'assessment_submit';

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

function getVelocityWindowMs() {
  return config.captcha?.velocityWindowMs ?? 5 * 60 * 1000;
}

function thresholdForRoute(route) {
  if (route === ROUTE_LOCK) return config.captcha?.lockThreshold ?? 25;
  if (route === ROUTE_ASSESSMENT_SUBMIT) return config.captcha?.assessmentSubmitThreshold ?? 15;
  return config.captcha?.paymentStartThreshold ?? 20;
}

function prune(tsList, now, windowMs) {
  const cutoff = now - windowMs;
  while (tsList.length && tsList[0] < cutoff) {
    tsList.shift();
  }
}

function recordAttempt(ip, route) {
  const windowMs = getVelocityWindowMs();
  const key = bucketKey(ip, route);
  const now = Date.now();
  let tsList = buckets.get(key);
  if (!tsList) {
    tsList = [];
    buckets.set(key, tsList);
  }
  prune(tsList, now, windowMs);
  tsList.push(now);
}

/**
 * Current per-IP count in window and threshold (after pruning).
 * @param {string} ip
 * @param {'lock'|'payment_start'|'assessment_submit'} route
 */
function velocitySnapshot(ip, route) {
  const windowMs = getVelocityWindowMs();
  const key = bucketKey(ip, route);
  const now = Date.now();
  const tsList = buckets.get(key);
  if (!tsList) {
    return { count: 0, threshold: thresholdForRoute(route), velocityWindowMs: windowMs };
  }
  prune(tsList, now, windowMs);
  return {
    count: tsList.length,
    threshold: thresholdForRoute(route),
    velocityWindowMs: windowMs,
  };
}

/**
 * Whether captcha would be required based on recent write attempts (risk layer).
 * @param {string} ip
 * @param {'lock'|'payment_start'|'assessment_submit'} route
 */
function shouldRequireCaptcha(ip, route) {
  const windowMs = getVelocityWindowMs();
  const key = bucketKey(ip, route);
  const now = Date.now();
  const tsList = buckets.get(key);
  if (!tsList) return false;
  prune(tsList, now, windowMs);
  return tsList.length >= thresholdForRoute(route);
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
 * @param {{ route: 'lock'|'payment_start'|'assessment_submit', slotId?: number }} ctx
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
  const snap = velocitySnapshot(ip, route);

  if (!need) {
    return { proceed: true };
  }

  const velocityLog = {
    count: snap.count,
    threshold: snap.threshold,
    velocityWindowMs: snap.velocityWindowMs,
  };

  if (mode === 'shadow') {
    logLine({
      level: 'info',
      tag: 'captcha_would_require',
      requestId: req.id ?? null,
      route,
      slotId: slotId != null ? slotId : null,
      ip,
      ...velocityLog,
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
      ...velocityLog,
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
      ...velocityLog,
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
    ...velocityLog,
  });
  return { proceed: true };
}

module.exports = {
  handleCaptchaGate,
  ROUTE_LOCK,
  ROUTE_PAYMENT_START,
  ROUTE_ASSESSMENT_SUBMIT,
};
