const { randomUUID } = require('crypto');
const { DateTime } = require('luxon');
const { billing } = require('../config');

const DEFAULT_VAT_RATE_PERCENT = 23;

function parseVatRatePercent() {
  const n = Number(billing.vatRate);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_VAT_RATE_PERCENT;
  return n;
}

function splitGrossToNetVat(grossCents, vatRatePercent) {
  const g = Math.round(grossCents);
  const net = Math.round(g / (1 + vatRatePercent / 100));
  const vat = g - net;
  return { amountNetCents: net, amountVatCents: vat, amountGrossCents: g };
}

function vatRatePercentToDocumentDecimal(vatRatePercent) {
  // billing_documents.vat_rate is DECIMAL(6,5), so store fraction form (e.g. 0.23000)
  const n = Number(vatRatePercent);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Number((n / 100).toFixed(5));
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

function todayInBratislava() {
  return DateTime.now().setZone('Europe/Bratislava').toFormat('yyyy-LL-dd');
}

async function findAdvanceDocumentForReservation(conn, reservationId) {
  if (!reservationId) return null;
  const [rows] = await conn.execute(
    `SELECT id
     FROM billing_documents
     WHERE reservation_id = ?
       AND document_type = 'advance'
     ORDER BY created_at DESC
     LIMIT 1`,
    [reservationId]
  );
  return rows[0] || null;
}

/**
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {object} params
 * @param {object} params.paymentRow - joined payment + reservation + user fields from webhook query
 * @param {object} params.session - Stripe Checkout Session object
 * @param {string} params.stripeEventId
 */
async function insertBillingDocumentForCompletedPayment(conn, { paymentRow, session, stripeEventId }) {
  const vatRate = parseVatRatePercent();
  const vatRateForDocument = vatRatePercentToDocumentDecimal(vatRate);
  const { amountNetCents, amountVatCents, amountGrossCents } = splitGrossToNetVat(
    paymentRow.amount_cents,
    vatRate
  );
  const today = todayInBratislava();

  const internalType = paymentDbTypeToInternalType(paymentRow.payment_type);
  const advanceDoc = await findAdvanceDocumentForReservation(conn, paymentRow.reservation_id);
  let documentType = 'standard';
  if (paymentRow.payment_type === 'deposit') {
    documentType = 'advance';
  } else if ((paymentRow.payment_type === 'session' || paymentRow.payment_type === 'topup') && advanceDoc) {
    documentType = 'settlement';
  }
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
  const krosExternalId = randomUUID();
  const customerName =
    String(paymentRow.billing_name || '').trim() ||
    String(paymentRow.user_name || '').trim() ||
    'Klient';

  const [result] = await conn.execute(
    `INSERT INTO billing_documents (
      internal_type,
      status,
      document_type,
      user_id,
      customer_name,
      customer_is_company,
      customer_company_name,
      customer_ico,
      customer_dic,
      customer_ic_dph,
      customer_street,
      customer_city,
      customer_post_code,
      customer_country,
      supplier_iban,
      supplier_swift,
      customer_email_snapshot,
      customer_name_snapshot,
      reservation_id,
      payment_id,
      advance_document_id,
      stripe_checkout_session_id,
      stripe_payment_intent_id,
      stripe_charge_id,
      currency,
      amount_net_cents,
      amount_vat_cents,
      amount_gross_cents,
      vat_rate,
      issue_date,
      due_date,
      delivery_date,
      kros_external_id,
      paid_at,
      metadata
    ) VALUES (?, 'recorded', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      internalType,
      documentType,
      paymentRow.user_id,
      customerName,
      Number(paymentRow.billing_is_company) === 1 ? 1 : 0,
      paymentRow.billing_company_name || null,
      paymentRow.billing_ico || null,
      paymentRow.billing_dic || null,
      paymentRow.billing_ic_dph || null,
      paymentRow.billing_street || null,
      paymentRow.billing_city || null,
      paymentRow.billing_post_code || null,
      (paymentRow.billing_country || 'SK').toUpperCase().slice(0, 2),
      billing.iban || '',
      billing.swift || '',
      email || '(unknown)',
      customerName,
      paymentRow.reservation_id,
      paymentRow.id,
      documentType === 'settlement' ? advanceDoc.id : null,
      session.id,
      stripePaymentIntentId(session),
      stripeChargeId(session),
      String(paymentRow.currency || 'eur').toLowerCase().slice(0, 3),
      amountNetCents,
      amountVatCents,
      amountGrossCents,
      vatRateForDocument,
      today,
      today,
      today,
      krosExternalId,
      paidAt,
      JSON.stringify(metadata),
    ]
  );

  await conn.execute(
    `INSERT INTO billing_document_lines (
      billing_document_id,
      line_no,
      name,
      description,
      amount,
      measure_unit,
      vat_rate,
      unit_price_excl_vat_cents,
      total_price_incl_vat_cents
    ) VALUES (?, 1, ?, NULL, 1, 'ks', ?, ?, ?)`,
    [result.insertId, billing.serviceName || 'Online sprevádzanie', vatRate, amountNetCents, amountGrossCents]
  );

  return result.insertId;
}

module.exports = {
  insertBillingDocumentForCompletedPayment,
  splitGrossToNetVat,
  vatRatePercentToDocumentDecimal,
  paymentDbTypeToInternalType,
  parseVatRatePercent,
};
