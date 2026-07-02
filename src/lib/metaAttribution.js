/** Meta _fbp / _fbc cookie validation (prefix + max length). */
const META_COOKIE_RE = /^fb\./;
const MAX_META_COOKIE_LEN = 200;
const MAX_USER_AGENT_LEN = 512;

/**
 * @param {unknown} val
 * @returns {string|null}
 */
function validateMetaCookie(val) {
  if (val == null || typeof val !== 'string') return null;
  const trimmed = val.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_META_COOKIE_LEN) return null;
  if (!META_COOKIE_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * @param {import('express').Request} req
 * @param {{ marketingConsent?: unknown, suppressTracking?: unknown }} [body]
 * @returns {{
 *   metaFbp: string|null,
 *   metaFbc: string|null,
 *   clientIp: string|null,
 *   clientUserAgent: string|null,
 *   marketingConsent: boolean,
 *   suppressTracking: boolean,
 * }}
 */
function extractMetaAttribution(req, body = {}) {
  const cookies = req.cookies || {};
  const ua = req.get('user-agent');
  return {
    metaFbp: validateMetaCookie(cookies._fbp),
    metaFbc: validateMetaCookie(cookies._fbc),
    clientIp: req.ip ? String(req.ip).slice(0, 45) : null,
    clientUserAgent: ua ? String(ua).slice(0, MAX_USER_AGENT_LEN) : null,
    marketingConsent: Boolean(body.marketingConsent),
    suppressTracking: Boolean(body.suppressTracking),
  };
}

/**
 * @param {import('mysql2/promise').Pool|import('mysql2/promise').PoolConnection} db
 * @param {string} providerRef
 * @param {ReturnType<typeof extractMetaAttribution>} attribution
 */
async function updatePaymentMetaAttribution(db, providerRef, attribution) {
  await db.execute(
    `UPDATE payments
     SET meta_fbp = ?, meta_fbc = ?, marketing_consent = ?, client_ip = ?,
         client_user_agent = ?, suppressed_tracking = ?
     WHERE provider_ref = ?`,
    [
      attribution.metaFbp,
      attribution.metaFbc,
      attribution.marketingConsent ? 1 : 0,
      attribution.clientIp,
      attribution.clientUserAgent,
      attribution.suppressTracking ? 1 : 0,
      providerRef,
    ]
  );
}

module.exports = {
  validateMetaCookie,
  extractMetaAttribution,
  updatePaymentMetaAttribution,
  META_COOKIE_RE,
  MAX_META_COOKIE_LEN,
};
