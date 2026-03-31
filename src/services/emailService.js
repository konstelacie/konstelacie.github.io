const path = require('path');
const ejs = require('ejs');
const emailProvider = require('../email/provider');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');

const EMAIL_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

function formatSlotDate(startAtUtc, timezone = 'Europe/Bratislava') {
  const d = startAtUtc instanceof Date ? startAtUtc : new Date(startAtUtc);
  return new Intl.DateTimeFormat('sk-SK', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: timezone,
  }).format(d);
}

function formatSlotTime(startAtUtc, timezone = 'Europe/Bratislava') {
  const d = startAtUtc instanceof Date ? startAtUtc : new Date(startAtUtc);
  return new Intl.DateTimeFormat('sk-SK', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timezone,
  }).format(d);
}

function formatAmount(amountCents, currency = 'eur') {
  const amount = (amountCents / 100).toFixed(2);
  const symbol = currency.toUpperCase() === 'EUR' ? '€' : currency.toUpperCase();
  return `${amount} ${symbol}`;
}

/**
 * Send reservation confirmation email.
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {object} params.slot - { start_at_utc, end_at_utc, timezone }
 * @param {number} params.amountCents - Amount paid in cents
 * @param {string} [params.currency='eur'] - Currency code
 * @param {object} [metadata] - Optional metadata for logging
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendReservationConfirmation({ to, slot, amountCents, currency = 'eur' }, metadata = {}) {
  const tz = slot.timezone || 'Europe/Bratislava';
  const slotDateFormatted = formatSlotDate(slot.start_at_utc, tz);
  const slotTimeFormatted = formatSlotTime(slot.start_at_utc, tz);
  const amountFormatted = formatAmount(amountCents, currency);

  const html = await ejs.renderFile(
    path.join(EMAIL_TEMPLATES_DIR, 'reservation-confirmation.ejs'),
    {
      slotDateFormatted,
      slotTimeFormatted,
      timezone: tz,
      amountFormatted,
    }
  );

  const result = await emailProvider.sendEmail(to, 'Rezervácia potvrdená', html, metadata);

  if (result.ok && result.messageId) {
    await emailSentLogRepo.log({
      recipientEmail: to,
      templateId: 'reservation-confirmation',
      entityType: metadata.entity_type,
      entityId: metadata.entity_id,
      providerMessageId: result.messageId,
      actorType: 'system',
    });
  }

  return result;
}

/**
 * Send pre-session reminder email (24h before slot).
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {object} params.slot - { start_at_utc, end_at_utc, timezone }
 * @param {object} [metadata] - Optional metadata for logging (entity_type, entity_id)
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendPreSessionReminder({ to, slot }, metadata = {}) {
  const tz = slot.timezone || 'Europe/Bratislava';
  const slotDateFormatted = formatSlotDate(slot.start_at_utc, tz);
  const slotTimeFormatted = formatSlotTime(slot.start_at_utc, tz);

  const html = await ejs.renderFile(
    path.join(EMAIL_TEMPLATES_DIR, 'pre-session-reminder.ejs'),
    { slotDateFormatted, slotTimeFormatted, timezone: tz }
  );

  const result = await emailProvider.sendEmail(to, 'Pripomienka sedenia zajtra', html, metadata);

  if (result.ok && result.messageId) {
    await emailSentLogRepo.log({
      recipientEmail: to,
      templateId: 'pre-session-reminder',
      entityType: metadata.entity_type,
      entityId: metadata.entity_id,
      providerMessageId: result.messageId,
      actorType: 'system',
    });
  }

  return result;
}

/**
 * Send billing invoice email (PDF from Phase 2 pipeline).
 * @param {object} params
 * @param {string} params.to
 * @param {object} params.documentRow - billing_documents row
 * @param {Buffer} params.pdfBuffer
 * @param {boolean} [params.resend] - admin resend; separate template id for logging
 * @param {object} [metadata]
 * @param {string} [metadata.actorType] - e.g. admin for resend audit
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendBillingInvoiceEmail(
  { to, documentRow, pdfBuffer, resend = false },
  metadata = {}
) {
  const documentNumber = documentRow.document_number || '';
  const amountFormatted = formatAmount(documentRow.amount_gross_cents, documentRow.currency);
  const safeFilename = `${documentNumber.replace(/[^\w.-]/g, '_')}.pdf`;

  const templateFile = resend ? 'billing-invoice-resend.ejs' : 'billing-invoice.ejs';
  const templateId = resend ? 'billing-invoice-resend' : 'billing-invoice';
  const subject = resend
    ? `Platobný doklad ${documentNumber} (znova) — citimtedasom.sk`
    : `Platobný doklad ${documentNumber} — citimtedasom.sk`;

  const html = await ejs.renderFile(path.join(EMAIL_TEMPLATES_DIR, templateFile), {
    documentNumber,
    amountFormatted,
  });

  const result = await emailProvider.sendEmail(
    to,
    subject,
    html,
    metadata,
    {
      attachments: [{ filename: safeFilename, content: pdfBuffer }],
    }
  );

  if (result.ok && result.messageId) {
    await emailSentLogRepo.log({
      recipientEmail: to,
      templateId,
      entityType: metadata.entity_type,
      entityId: metadata.entity_id,
      providerMessageId: result.messageId,
      actorType: metadata.actorType || 'system',
    });
  }

  return result;
}

module.exports = {
  sendReservationConfirmation,
  sendPreSessionReminder,
  sendBillingInvoiceEmail,
};
