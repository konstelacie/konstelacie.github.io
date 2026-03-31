/**
 * Stripe Checkout Session expires_at must be between 30 minutes and 24 hours after creation.
 * The slot lock uses the same end instant so the hold matches the payment window.
 */
const CHECKOUT_HOLD_MS = 30 * 60 * 1000;

function checkoutExpiresAtFromNow() {
  return new Date(Date.now() + CHECKOUT_HOLD_MS);
}

module.exports = { CHECKOUT_HOLD_MS, checkoutExpiresAtFromNow };
