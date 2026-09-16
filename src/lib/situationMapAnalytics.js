/**
 * Mapa situácie analytics helpers.
 * Web events must not include textarea content, names, or emails.
 */

const ANSWER_LENGTH_BUCKETS = ['0', '1-50', '51-150', '151-400', '401+'];
const RESPONSE_STATUSES = ['pending', 'drafting', 'ready_for_review', 'approved', 'sent'];
const TIME_TO_RESPONSE_BUCKETS = ['0-1h', '1-4h', '4-24h', '1-3d', '3-7d', '7d+'];
const RESPONSE_SOURCES = ['mock', 'manual'];

function timeToResponseBucket(fromAt, toAt) {
  const from = fromAt instanceof Date ? fromAt : fromAt ? new Date(fromAt) : null;
  const to = toAt instanceof Date ? toAt : toAt ? new Date(toAt) : null;
  if (!from || !to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const ms = to.getTime() - from.getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const hours = ms / 36e5;
  if (hours < 1) return '0-1h';
  if (hours < 4) return '1-4h';
  if (hours < 24) return '4-24h';
  if (hours < 72) return '1-3d';
  if (hours < 168) return '3-7d';
  return '7d+';
}

function answerLengthBucket(length) {
  const n = Number(length);
  const size = Number.isFinite(n) && n > 0 ? n : 0;
  if (size <= 0) return '0';
  if (size <= 50) return '1-50';
  if (size <= 150) return '51-150';
  if (size <= 400) return '151-400';
  return '401+';
}

function sanitizeStepNumber(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 20) return null;
  return n;
}

function sanitizeSubmissionId(raw) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

/**
 * Allowlisted event properties only. Drops answer text, PII, and unknown keys.
 * @returns {object|null}
 */
function sanitizeEventProperties(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  if (raw.answered === true) out.answered = true;
  if (
    typeof raw.answerLengthBucket === 'string' &&
    ANSWER_LENGTH_BUCKETS.includes(raw.answerLengthBucket)
  ) {
    out.answerLengthBucket = raw.answerLengthBucket;
  }
  if (typeof raw.offerId === 'string' && /^[a-zA-Z0-9_-]{1,64}$/.test(raw.offerId.trim())) {
    out.offerId = raw.offerId.trim();
  }
  if (
    typeof raw.offerVariant === 'string' &&
    /^[a-zA-Z0-9_-]{1,32}$/.test(raw.offerVariant.trim())
  ) {
    out.offerVariant = raw.offerVariant.trim();
  }
  if (typeof raw.responseStatus === 'string' && RESPONSE_STATUSES.includes(raw.responseStatus)) {
    out.responseStatus = raw.responseStatus;
  }
  if (typeof raw.responseSource === 'string' && RESPONSE_SOURCES.includes(raw.responseSource)) {
    out.responseSource = raw.responseSource;
  }
  if (
    typeof raw.promptVersion === 'string' &&
    /^[a-zA-Z0-9._-]{1,64}$/.test(raw.promptVersion.trim())
  ) {
    out.promptVersion = raw.promptVersion.trim();
  }
  if (
    typeof raw.timeToResponseBucket === 'string' &&
    TIME_TO_RESPONSE_BUCKETS.includes(raw.timeToResponseBucket)
  ) {
    out.timeToResponseBucket = raw.timeToResponseBucket;
  }
  return Object.keys(out).length ? out : null;
}

module.exports = {
  ANSWER_LENGTH_BUCKETS,
  RESPONSE_STATUSES,
  TIME_TO_RESPONSE_BUCKETS,
  RESPONSE_SOURCES,
  answerLengthBucket,
  timeToResponseBucket,
  sanitizeStepNumber,
  sanitizeSubmissionId,
  sanitizeEventProperties,
};
