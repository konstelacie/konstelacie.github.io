/**
 * Stripe Checkout Session expires_at must be between 30 minutes and 24 hours after creation.
 * The slot lock uses the same end instant so the hold matches the payment window.
 */
const CHECKOUT_HOLD_MS = 30 * 60 * 1000;

/** After user returns from Stripe without paying, remaining hold length is clamped to this range. */
const POST_CHECKOUT_CANCEL_HOLD_MIN_MS = 5 * 60 * 1000;
const POST_CHECKOUT_CANCEL_HOLD_MAX_MS = 15 * 60 * 1000;

function checkoutExpiresAtFromNow() {
  return new Date(Date.now() + CHECKOUT_HOLD_MS);
}

function clampMs(valueMs, minMs, maxMs) {
  return Math.min(maxMs, Math.max(minMs, valueMs));
}

/**
 * @param {number} remainingCheckoutMs — time left until previous checkout_expires_at (≥ 0)
 * @returns {Date} now + clamp(remaining, POST_CHECKOUT_CANCEL_HOLD_MIN_MS, POST_CHECKOUT_CANCEL_HOLD_MAX_MS)
 */
function lockExpiresAtAfterCheckoutCancel(remainingCheckoutMs) {
  const ms = clampMs(remainingCheckoutMs, POST_CHECKOUT_CANCEL_HOLD_MIN_MS, POST_CHECKOUT_CANCEL_HOLD_MAX_MS);
  return new Date(Date.now() + ms);
}

module.exports = {
  CHECKOUT_HOLD_MS,
  POST_CHECKOUT_CANCEL_HOLD_MIN_MS,
  POST_CHECKOUT_CANCEL_HOLD_MAX_MS,
  checkoutExpiresAtFromNow,
  clampMs,
  lockExpiresAtAfterCheckoutCancel,
};
