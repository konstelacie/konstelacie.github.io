const Stripe = require('stripe');
const paymentBackend = require('../config/paymentBackend');

/**
 * Verify Stripe webhook signature against configured test and prod secrets.
 * @returns {{ event: import('stripe').Stripe.Event, backend: 'test'|'prod' }}
 */
function constructStripeEvent(rawBody, signature) {
  const secrets = paymentBackend.stripeWebhookSecrets();
  if (!signature || secrets.length === 0) {
    throw new Error('missing_signature_or_webhook_secret');
  }

  let lastErr;
  for (const secret of secrets) {
    try {
      const event = Stripe.webhooks.constructEvent(rawBody, signature, secret);
      return {
        event,
        backend: paymentBackend.backendFromStripeLivemode(Boolean(event.livemode)),
      };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('invalid_signature');
}

module.exports = {
  constructStripeEvent,
};
