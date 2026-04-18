const crypto = require('crypto');

function getBalancePaySecret() {
  const s = process.env.BALANCE_PAY_TOKEN_SECRET;
  if (s && String(s).trim()) return String(s).trim();
  if (process.env.NODE_ENV === 'production') {
    throw new Error('BALANCE_PAY_TOKEN_SECRET is required in production');
  }
  return 'dev-balance-pay-token-secret-not-for-production';
}

/**
 * @param {number} reservationId
 * @param {number} ttlSeconds
 * @returns {string} URL-safe token
 */
function signBalancePayToken(reservationId, ttlSeconds) {
  const rid = Math.floor(Number(reservationId));
  if (!Number.isInteger(rid) || rid <= 0) {
    throw new Error('reservationId must be a positive integer');
  }
  const ttl = Math.floor(Number(ttlSeconds));
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > 365 * 24 * 3600) {
    throw new Error('ttlSeconds must be between 1 and 365 days');
  }
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const payload = `${rid}.${exp}`;
  const sig = crypto.createHmac('sha256', getBalancePaySecret()).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/**
 * @param {string} token
 * @returns {{ reservationId: number, exp: number } | null}
 */
function verifyBalancePayToken(token) {
  if (typeof token !== 'string' || !token.trim()) return null;
  const s = token.trim();
  if (s.length > 512) return null;
  const parts = s.split('.');
  if (parts.length !== 3) return null;
  const [ridStr, expStr, sig] = parts;
  const rid = parseInt(ridStr, 10);
  const exp = parseInt(expStr, 10);
  if (!Number.isInteger(rid) || rid <= 0 || !Number.isInteger(exp) || exp <= 0) return null;
  const payload = `${rid}.${exp}`;
  const expected = crypto.createHmac('sha256', getBalancePaySecret()).update(payload).digest('base64url');
  try {
    const a = Buffer.from(sig, 'base64url');
    const b = Buffer.from(expected, 'base64url');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  if (exp < Math.floor(Date.now() / 1000)) return null;
  return { reservationId: rid, exp };
}

module.exports = {
  getBalancePaySecret,
  signBalancePayToken,
  verifyBalancePayToken,
};
