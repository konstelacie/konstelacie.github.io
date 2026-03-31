/**
 * Phase 1 invoicing: persist billing_documents rows on completed Stripe payments.
 * VAT split is indicative until accountant confirms rates and rounding (see docs/payments/invoicing-mvp-implementation.md).
 */

const DEFAULT_VAT_RATE = 0.23;

function parseVatRateFromEnv() {
  const raw = process.env.BILLING_VAT_RATE;
  if (raw == null || raw === '') return DEFAULT_VAT_RATE;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return DEFAULT_VAT_RATE;
  return n;
}

function splitGrossToNetVat(grossCents, vatRate) {
  const g = Math.round(grossCents);
  const net = Math.round(g / (1 + vatRate));
  const vat = g - net;
  return { amountNetCents: net, amountVatCents: vat, amountGrossCents: g };
}

function paymentDbTypeToInternalType(paymentType) {
  if (paymentType === 'deposit') return 'deposit';
  if (paymentType === 'session') return 'full';
  if (paymentType === 'topup') return 'topup';
  throw new Error(`Unsupported payment_type for billing: ${paymentType}`);
}

function stripePaymentIntentId(session) {
  const pi = session.payment_intent;
  if (typeof pi === 'string') return pi;
  if (pi && typeof pi.id === 'string') return pi.id;
  return null;
}

function stripeChargeId(session) {
  const ch = session.latest_charge ?? session.charge;
  if (typeof ch === 'string') return ch;
  if (ch && typeof ch.id === 'string') return ch.id;
  return null;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} params
 * @param {object} params.paymentRow - joined payment + reservation + user fields from webhook query
 * @param {object} params.session - Stripe Checkout Session object
 * @param {string} params.stripeEventId
 */
async function insertBillingDocumentForCompletedPayment(conn, { paymentRow, session, stripeEventId }) {
  const vatRate = parseVatRateFromEnv();
  const { amountNetCents, amountVatCents, amountGrossCents } = splitGrossToNetVat(
    paymentRow.amount_cents,
    vatRate
  );

  const internalType = paymentDbTypeToInternalType(paymentRow.payment_type);
  const email =
    paymentRow.reservation_email ||
    paymentRow.user_email ||
    session.customer_email ||
    session.customer_details?.email ||
    '';

  if (!email) {
    console.warn('[billing] No customer email snapshot for payment', paymentRow.id);
  }

  const metadata = {
    stripeEventId,
    funnelName: paymentRow.funnel_name ?? null,
    funnelCampaign: paymentRow.funnel_campaign ?? null,
    funnelVideoId: paymentRow.funnel_video_id ?? null,
    stripeAmountTotal: session.amount_total ?? null,
    stripeCurrency: session.currency ?? null,
  };

  const paidAt = new Date();

  const [result] = await conn.execute(
    `INSERT INTO billing_documents (
      internal_type,
      status,
      user_id,
      customer_email_snapshot,
      customer_name_snapshot,
      reservation_id,
      payment_id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      stripe_charge_id,
      currency,
      amount_net_cents,
      amount_vat_cents,
      amount_gross_cents,
      vat_rate,
      paid_at,
      metadata
    ) VALUES (?, 'recorded', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      internalType,
      paymentRow.user_id,
      email || '(unknown)',
      paymentRow.user_name,
      paymentRow.reservation_id,
      paymentRow.id,
      session.id,
      stripePaymentIntentId(session),
      stripeChargeId(session),
      String(paymentRow.currency || 'eur').toLowerCase().slice(0, 3),
      amountNetCents,
      amountVatCents,
      amountGrossCents,
      vatRate,
      paidAt,
      JSON.stringify(metadata),
    ]
  );

  return result.insertId;
}

module.exports = {
  insertBillingDocumentForCompletedPayment,
  splitGrossToNetVat,
  paymentDbTypeToInternalType,
  parseVatRateFromEnv,
};
