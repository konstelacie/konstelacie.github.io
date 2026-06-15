const Stripe = require('stripe');
const paymentBackend = require('../config/paymentBackend');

/**
 * List recent paid Checkout Sessions from Stripe (both backends when configured).
 * @param {{ sinceUnix: number, limitPerBackend?: number }} opts
 * @returns {Promise<Array<{ session: object, backend: string }>>}
 */
async function listRecentCompletedCheckoutSessions({ sinceUnix, limitPerBackend = 100 }) {
  const results = [];

  for (const backend of paymentBackend.BACKENDS) {
    let secretKey;
    try {
      secretKey = paymentBackend.requireStripeSecret(backend);
    } catch {
      continue;
    }

    const stripe = new Stripe(secretKey);
    let startingAfter;
    let fetched = 0;

    while (fetched < limitPerBackend) {
      const pageLimit = Math.min(100, limitPerBackend - fetched);
      const params = {
        limit: pageLimit,
        created: { gte: sinceUnix },
        status: 'complete',
      };
      if (startingAfter) {
        params.starting_after = startingAfter;
      }

      const page = await stripe.checkout.sessions.list(params);
      for (const session of page.data) {
        if (session.payment_status === 'paid') {
          results.push({ session, backend });
        }
      }

      fetched += page.data.length;
      if (!page.has_more || page.data.length === 0) {
        break;
      }
      startingAfter = page.data[page.data.length - 1].id;
    }
  }

  return results;
}

module.exports = {
  listRecentCompletedCheckoutSessions,
};
