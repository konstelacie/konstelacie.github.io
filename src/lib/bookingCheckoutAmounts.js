/**
 * Booking checkout amounts (reservation deposit, full payment, session minimum).
 * Configure via .env — see .env.example and docs/API.md.
 */

const DEFAULT_MIN_SESSION_TOTAL_EUR = 45;
const DEFAULT_SESSION_FULL_EUR = 85;

/**
 * @param {string|undefined|null} raw
 * @param {number} fallback
 * @returns {number} positive integer EUR
 */
function parsePositiveIntEur(raw, fallback) {
  if (raw == null || String(raw).trim() === '') return fallback;
  const n = parseInt(String(raw).trim(), 10);
  if (!Number.isInteger(n) || n < 1) return fallback;
  return n;
}

const MIN_SESSION_TOTAL_EUR = parsePositiveIntEur(
  process.env.BOOKING_SESSION_MIN_EUR,
  DEFAULT_MIN_SESSION_TOTAL_EUR
);

const FULL_PAYMENT_CHECKOUT_EUR = parsePositiveIntEur(
  process.env.BOOKING_SESSION_FULL_EUR,
  DEFAULT_SESSION_FULL_EUR
);

/**
 * @param {string} funnelName
 * @returns {string}
 */
function funnelDepositEnvKey(funnelName) {
  return `FUNNEL_${String(funnelName).toUpperCase()}_DEPOSIT_EUR`;
}

/**
 * @param {string|null|undefined} funnelName - validated instance id (`site`, `pilot`, …)
 * @returns {number} integer EUR
 */
function reservationDepositEurForFunnel(funnelName) {
  const name = funnelName && String(funnelName).trim();
  if (!name || name === 'site') {
    return MIN_SESSION_TOTAL_EUR;
  }
  return parsePositiveIntEur(process.env[funnelDepositEnvKey(name)], MIN_SESSION_TOTAL_EUR);
}

/**
 * @param {string|null|undefined} funnelName
 * @returns {number} cents
 */
function reservationDepositCentsForFunnel(funnelName) {
  return reservationDepositEurForFunnel(funnelName) * 100;
}

/**
 * EJS locals for booking UI on a surface.
 * @param {string|null|undefined} funnelName
 */
function bookingPricingViewLocals(funnelName) {
  return {
    reservationDepositEur: reservationDepositEurForFunnel(funnelName),
    fullPaymentCheckoutEur: FULL_PAYMENT_CHECKOUT_EUR,
    minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
  };
}

/** Inline script for booking.js fallbacks (single source of truth with server env). */
function bookingPricingDefaultsScriptTag() {
  const payload = {
    minSessionTotalEur: MIN_SESSION_TOTAL_EUR,
    fullPaymentCheckoutEur: FULL_PAYMENT_CHECKOUT_EUR,
  };
  return `<script>window.__BOOKING_PRICING_DEFAULTS=${JSON.stringify(payload)}</script>`;
}

module.exports = {
  DEFAULT_MIN_SESSION_TOTAL_EUR,
  DEFAULT_SESSION_FULL_EUR,
  MIN_SESSION_TOTAL_EUR,
  MIN_SESSION_TOTAL_CENTS: MIN_SESSION_TOTAL_EUR * 100,
  FULL_PAYMENT_CHECKOUT_EUR,
  funnelDepositEnvKey,
  reservationDepositEurForFunnel,
  reservationDepositCentsForFunnel,
  bookingPricingViewLocals,
  bookingPricingDefaultsScriptTag,
};
