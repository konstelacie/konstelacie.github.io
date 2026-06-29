const Stripe = require('stripe');
const paymentBackend = require('../config/paymentBackend');
const { logLine } = require('./structuredLog');

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} providerRef
 */
async function findPaymentRowByProviderRef(pool, providerRef) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slot_id, p.reservation_id, p.amount_cents, p.currency,
            u.email AS user_email, r.email AS reservation_email
     FROM payments p
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN reservations r ON r.id = p.reservation_id
     WHERE p.provider = 'stripe' AND p.provider_ref = ?
     LIMIT 1`,
    [providerRef]
  );
  return rows[0] || null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} paymentIntentId
 */
async function findPaymentRowByPaymentIntentId(pool, paymentIntentId) {
  const [rows] = await pool.execute(
    `SELECT p.id, p.slot_id, p.reservation_id, p.amount_cents, p.currency,
            u.email AS user_email, r.email AS reservation_email
     FROM billing_documents bd
     INNER JOIN payments p ON p.id = bd.payment_id
     LEFT JOIN users u ON u.id = p.user_id
     LEFT JOIN reservations r ON r.id = p.reservation_id
     WHERE bd.stripe_payment_intent_id = ?
     LIMIT 1`,
    [paymentIntentId]
  );
  return rows[0] || null;
}

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {string} paymentIntentId
 * @param {'test'|'prod'} paymentBackendName
 */
async function resolvePaymentRowForPaymentIntent(pool, paymentIntentId, paymentBackendName) {
  const fromBilling = await findPaymentRowByPaymentIntentId(pool, paymentIntentId);
  if (fromBilling) return fromBilling;

  try {
    const stripeSecret = paymentBackend.requireStripeSecret(paymentBackendName);
    const stripe = new Stripe(stripeSecret);
    const sessions = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 1 });
    const sessionId = sessions.data[0]?.id;
    if (sessionId) {
      return findPaymentRowByProviderRef(pool, sessionId);
    }
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'lead_events_stripe_lookup_failed',
      paymentIntentId,
      error: err?.message || String(err),
    });
  }

  return null;
}

/**
 * @param {{ user_email?: string|null, reservation_email?: string|null }} row
 */
function emailFromPaymentRow(row) {
  if (!row) return '';
  const email = row.reservation_email || row.user_email || '';
  return String(email).trim();
}

module.exports = {
  findPaymentRowByProviderRef,
  findPaymentRowByPaymentIntentId,
  resolvePaymentRowForPaymentIntent,
  emailFromPaymentRow,
};
