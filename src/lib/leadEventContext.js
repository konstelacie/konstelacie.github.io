const pageVisibility = require('../config/pageVisibility');

/**
 * Derive optional lead-event attribution from an HTTP request.
 * @param {import('express').Request} [req]
 * @returns {{ formId: string|null, sourceUrl: string|null }}
 */
function leadContextFromRequest(req) {
  if (!req) return { formId: null, sourceUrl: null };

  const referer = req.get('Referer') || req.get('Referrer') || null;
  if (!referer || typeof referer !== 'string') {
    return { formId: null, sourceUrl: null };
  }

  let formId = null;
  try {
    const pathOnly = pageVisibility.normalizePathOnly(new URL(referer).pathname);
    const funnelName = pageVisibility.pathToFunnelName(pathOnly);
    if (funnelName) formId = funnelName;
  } catch {
    // ignore malformed referer
  }

  return {
    formId,
    sourceUrl: referer.slice(0, 2048),
  };
}

/**
 * @param {number|null|undefined} amountCents
 * @returns {number|null}
 */
function centsToLeadAmount(amountCents) {
  if (amountCents == null || !Number.isFinite(Number(amountCents))) return null;
  return Math.round(Number(amountCents)) / 100;
}

/**
 * Idempotency key shared by reconcile job and Stripe checkout.session.expired webhook.
 * @param {number|string} paymentId
 */
function checkoutExpiredProviderEventId(paymentId) {
  return `payment_expired:${paymentId}`;
}

module.exports = {
  leadContextFromRequest,
  centsToLeadAmount,
  checkoutExpiredProviderEventId,
};
