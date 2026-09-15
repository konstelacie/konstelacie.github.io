/**
 * Mapa situácie analytics helpers.
 * Web events must not include textarea content, names, or emails.
 */

const ANSWER_LENGTH_BUCKETS = ['0', '1-50', '51-150', '151-400', '401+'];

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
  return Object.keys(out).length ? out : null;
}

module.exports = {
  ANSWER_LENGTH_BUCKETS,
  answerLengthBucket,
  sanitizeStepNumber,
  sanitizeSubmissionId,
  sanitizeEventProperties,
};
