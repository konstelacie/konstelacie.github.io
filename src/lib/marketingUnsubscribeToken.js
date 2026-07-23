const crypto = require('crypto');

function getMarketingUnsubscribeSecret() {
  const s = process.env.MARKETING_UNSUBSCRIBE_TOKEN_SECRET;
  if (s && String(s).trim()) return String(s).trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('MARKETING_UNSUBSCRIBE_TOKEN_SECRET is required in production');
  }
  return 'dev-marketing-unsubscribe-token-secret-not-for-production';
}

/**
 * Long-lived signed token for one-click marketing unsubscribe.
 * @param {number} enrollmentId
 * @param {number} [ttlSeconds=365 * 24 * 3600]
 * @returns {string}
 */
function signMarketingUnsubscribeToken(enrollmentId, ttlSeconds = 365 * 24 * 3600) {
  const eid = Math.floor(Number(enrollmentId));
  if (!Number.isInteger(eid) || eid <= 0) {
    throw new Error('enrollmentId must be a positive integer');
  }
  const ttl = Math.floor(Number(ttlSeconds));
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 5 * 365 * 24 * 3600) {
    throw new Error('ttlSeconds out of range');
  }
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${eid}.${exp}`;
  const sig = crypto
    .createHmac('sha256', getMarketingUnsubscribeSecret())
    .update(payload)
    .digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * @param {string} token
 * @returns {{ enrollmentId: number, exp: number } | null}
 */
function verifyMarketingUnsubscribeToken(token) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const s = token.trim();
  if (s.length > 512) return null;
  const parts = s.split('.');
  if (parts.length !== 3) return null;
  const [eidStr, expStr, sig] = parts;
  const eid = parseInt(eidStr, 10);
  const exp = parseInt(expStr, 10);
  if (!Number.isInteger(eid) || eid <= 0 || !Number.isInteger(exp) || exp <= 0) return null;
  const payload = `${eid}.${exp}`;
  let expected;
  try {
    expected = crypto
      .createHmac('sha256', getMarketingUnsubscribeSecret())
      .update(payload)
      .digest('base64url');
  } catch {
    return null;
  }
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return { enrollmentId: eid, exp };
}

module.exports = {
  getMarketingUnsubscribeSecret,
  signMarketingUnsubscribeToken,
  verifyMarketingUnsubscribeToken,
};
