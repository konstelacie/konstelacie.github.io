const Stripe = require('stripe');
const paymentBackend = require('../config/paymentBackend');

/**
 * Expire a Stripe Checkout Session using test or prod secret (whichever owns the session).
 */
async function expireStripeCheckoutSession(sessionId) {
  let lastErr;
  for (const backend of paymentBackend.BACKENDS) {
    let secretKey;
    try {
      secretKey = paymentBackend.requireStripeSecret(backend);
    } catch {
      continue;
    }
    const stripe = new Stripe(secretKey);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await stripe.checkout.sessions.expire(sessionId);
        return;
      } catch (e) {
        lastErr = e;
        const code = e && e.code ? String(e.code) : '';
        const msg = e && e.message ? String(e.message) : '';
        const benign =
          code === 'resource_missing' ||
          /already been completed|already expired|expired/i.test(msg);
        if (code === 'resource_missing') {
          break;
        }
        if (benign || attempt === 2) {
          if (!benign) throw e;
          return;
        }
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
  }
  if (lastErr) {
    const code = lastErr && lastErr.code ? String(lastErr.code) : '';
    if (code !== 'resource_missing') {
      throw lastErr;
    }
  }
}

module.exports = {
  expireStripeCheckoutSession,
};
