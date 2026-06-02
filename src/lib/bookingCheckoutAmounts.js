/**
 * First-checkout reservation and full-payment amounts (booking modal → Stripe).
 * Change values here, or disable the pilot low deposit via env (see below).
 */

/** Main site and default when funnel is unknown / omitted. */
const RESERVATION_DEPOSIT_EUR_DEFAULT = 45;

/** Cold-traffic funnels while low-deposit promo is on. */
const RESERVATION_DEPOSIT_EUR_FUNNEL_PROMO = 10;
const FUNNEL_LOW_DEPOSIT_INSTANCES = ['pilot', 'manipulacia'];

/** Single “pay in full now” option at booking. */
const FULL_PAYMENT_CHECKOUT_EUR = 85;

/**
 * When false, pilot uses the same reservation deposit as the main site (45 €).
 * Set `BOOKING_FUNNEL_LOW_DEPOSIT_PROMO=0` (or `false` / `off`) in the environment.
 */
function isFunnelLowDepositPromoActive() {
  const v = process.env.BOOKING_FUNNEL_LOW_DEPOSIT_PROMO;
  if (v == null || String(v).trim() === '') return true;
  const s = String(v).trim().toLowerCase();
  return s !== '0' && s !== 'false' && s !== 'off';
}

/**
 * @param {string|null|undefined} funnelName - validated instance id (`site`, `pilot`, …)
 * @returns {number} integer EUR
 */
function reservationDepositEurForFunnel(funnelName) {
  const name = funnelName && String(funnelName).trim();
  if (name && FUNNEL_LOW_DEPOSIT_INSTANCES.includes(name) && isFunnelLowDepositPromoActive()) {
    return RESERVATION_DEPOSIT_EUR_FUNNEL_PROMO;
  }
  return RESERVATION_DEPOSIT_EUR_DEFAULT;
}

/**
 * @param {string|null|undefined} funnelName
 * @returns {number} cents
 */
function reservationDepositCentsForFunnel(funnelName) {
  return reservationDepositEurForFunnel(funnelName) * 100;
}

module.exports = {
  RESERVATION_DEPOSIT_EUR_DEFAULT,
  RESERVATION_DEPOSIT_EUR_FUNNEL_PROMO,
  FULL_PAYMENT_CHECKOUT_EUR,
  isFunnelLowDepositPromoActive,
  reservationDepositEurForFunnel,
  reservationDepositCentsForFunnel,
};
