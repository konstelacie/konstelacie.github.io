const path = require('path');
const ejs = require('ejs');
const emailProvider = require('../email/provider');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');

const EMAIL_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

/** Delay before sending automatic billing receipt email (ms), after reservation confirmation. */
const BILLING_RECEIPT_SCHEDULE_DELAY_MS = 15 * 60 * 1000;

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

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeHtmlAttribute(s) {
  return escapeHtml(s).replace(/\r?\n/g, ' ');
}

/** Plain text → safe HTML paragraphs for transactional mail. */
function formatBalancePayCustomMessageHtml(plain) {
  const t = typeof plain === 'string' ? plain.trim() : '';
  if (!t) {
    return (
      '<p style="margin:0 0 16px;">Ahoj,</p>' +
      '<p style="margin:0 0 16px;">posielame ti odkaz, kde môžeš <strong>dobrovoľne</strong> doplniť platbu za sedenie (minimálna úhrada už je splnená).</p>'
    );
  }
  const blocks = t.split(/\n{2,}/);
  const parts = [];
  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;
    const withBr = escapeHtml(b).replace(/\n/g, '<br>');
    parts.push(`<p style="margin:0 0 16px;">${withBr}</p>`);
  }
  if (parts.length === 0) {
    return formatBalancePayCustomMessageHtml('');
  }
  return parts.join('');
}

const DEFAULT_BALANCE_PAY_INVITE_SUBJECT = 'Voliteľný doplatok za sedenie — citimtedasom.sk';
const MAX_BALANCE_PAY_INVITE_SUBJECT_LEN = 200;
const MAX_BALANCE_PAY_INVITE_MESSAGE_LEN = 8000;

/**
 * Send reservation confirmation email.
 * @param {object} params
 * @param {string} params.to - Recipient email
 * @param {object} params.slot - { start_at_utc, end_at_utc, timezone }
 * @param {number} params.amountCents - Amount paid in cents
 * @param {string} [params.currency='eur'] - Currency code
 * @param {'deposit'|'full'} [params.bookingPaymentType='deposit'] - Reservation fee only vs full session upfront (from reservations.payment_type)
 * @param {object} [metadata] - Optional metadata for logging
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendReservationConfirmation(
  { to, slot, amountCents, currency = 'eur', bookingPaymentType = 'deposit' },
  metadata = {}
) {
  const tz = slot.timezone || 'Europe/Bratislava';
  const slotDateFormatted = formatSlotDate(slot.start_at_utc, tz);
  const slotTimeFormatted = formatSlotTime(slot.start_at_utc, tz);
  const amountFormatted = formatAmount(amountCents, currency);
  const isFullPayment = bookingPaymentType === 'full';

  const meetingUrl = (process.env.SESSION_MEETING_URL || '').trim() || null;

  const html = await ejs.renderFile(
    path.join(EMAIL_TEMPLATES_DIR, 'reservation-confirmation.ejs'),
    {
      slotDateFormatted,
      slotTimeFormatted,
      timezone: tz,
      amountFormatted,
      isFullPayment,
      meetingUrl,
    }
  );

  const subject = isFullPayment
    ? 'Platba je dokončená — rezervácia potvrdená'
    : 'Rezervácia je potvrdená';

  const result = await emailProvider.sendEmail(to, subject, html, metadata);

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
 * @param {boolean} [params.resend] - admin resend (immediate send); first send is scheduled +15m via Resend
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

  const sendOptions = {
    attachments: [{ filename: safeFilename, content: pdfBuffer }],
  };
  if (!resend) {
    sendOptions.scheduledAt = new Date(Date.now() + BILLING_RECEIPT_SCHEDULE_DELAY_MS).toISOString();
  }

  const result = await emailProvider.sendEmail(to, subject, html, metadata, sendOptions);

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

/**
 * Operator-triggered e-mail with optional personal message + balance payment link.
 * @param {object} params
 * @param {string} params.to
 * @param {string} [params.subject] - optional; default Slovak subject
 * @param {string} [params.customMessagePlain] - optional plain text (paragraphs); HTML escaped
 * @param {string} params.balanceUrl - signed app URL (trusted)
 * @param {object} params.slot - { start_at_utc, timezone }
 * @param {object} [metadata]
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendBalancePayInviteEmail(
  { to, subject, customMessagePlain, balanceUrl, slot },
  metadata = {}
) {
  const tz = slot.timezone || 'Europe/Bratislava';
  const slotDateFormatted = formatSlotDate(slot.start_at_utc, tz);
  const slotTimeFormatted = formatSlotTime(slot.start_at_utc, tz);
  const customMessageHtml = formatBalancePayCustomMessageHtml(customMessagePlain);
  const balanceUrlAttr = escapeHtmlAttribute(balanceUrl);
  const balanceUrlText = escapeHtml(balanceUrl);

  let finalSubject = DEFAULT_BALANCE_PAY_INVITE_SUBJECT;
  if (typeof subject === 'string' && subject.trim()) {
    finalSubject = subject.trim().slice(0, MAX_BALANCE_PAY_INVITE_SUBJECT_LEN);
  }

  const html = await ejs.renderFile(path.join(EMAIL_TEMPLATES_DIR, 'balance-pay-invite.ejs'), {
    slotDateFormatted,
    slotTimeFormatted,
    timezone: tz,
    customMessageHtml,
    balanceUrlAttr,
    balanceUrlText,
  });

  const result = await emailProvider.sendEmail(to, finalSubject, html, metadata);

  if (result.ok && result.messageId) {
    await emailSentLogRepo.log({
      recipientEmail: to,
      templateId: 'balance-pay-invite',
      entityType: metadata.entity_type,
      entityId: metadata.entity_id,
      providerMessageId: result.messageId,
      actorType: metadata.actorType || 'admin',
    });
  }

  return result;
}

module.exports = {
  sendReservationConfirmation,
  sendPreSessionReminder,
  sendBillingInvoiceEmail,
  sendBalancePayInviteEmail,
  DEFAULT_BALANCE_PAY_INVITE_SUBJECT,
  MAX_BALANCE_PAY_INVITE_MESSAGE_LEN,
};
