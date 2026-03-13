const path = require('path');
const ejs = require('ejs');
const emailProvider = require('../email/provider');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');

const EMAIL_TEMPLATES_DIR = path.join(__dirname, '..', 'templates', 'emails');

const dateFormatter = new Intl.DateTimeFormat('sk-SK', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('sk-SK', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

function formatSlotDate(startAt) {
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  return dateFormatter.format(d);
}

function formatSlotTime(startAt) {
  const d = startAt instanceof Date ? startAt : new Date(startAt);
  return timeFormatter.format(d);
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
 * @param {object} params.slot - { start_at, end_at, timezone }
 * @param {number} params.amountCents - Amount paid in cents
 * @param {string} [params.currency='eur'] - Currency code
 * @param {object} [metadata] - Optional metadata for logging
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendReservationConfirmation({ to, slot, amountCents, currency = 'eur' }, metadata = {}) {
  const slotDateFormatted = formatSlotDate(slot.start_at);
  const slotTimeFormatted = formatSlotTime(slot.start_at);
  const timezone = slot.timezone || 'Europe/Bratislava';
  const amountFormatted = formatAmount(amountCents, currency);

  const html = await ejs.renderFile(
    path.join(EMAIL_TEMPLATES_DIR, 'reservation-confirmation.ejs'),
    {
      slotDateFormatted,
      slotTimeFormatted,
      timezone,
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
 * @param {object} params.slot - { start_at, end_at, timezone }
 * @param {object} [metadata] - Optional metadata for logging (entity_type, entity_id)
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendPreSessionReminder({ to, slot }, metadata = {}) {
  const slotDateFormatted = formatSlotDate(slot.start_at);
  const slotTimeFormatted = formatSlotTime(slot.start_at);
  const timezone = slot.timezone || 'Europe/Bratislava';

  const html = await ejs.renderFile(
    path.join(EMAIL_TEMPLATES_DIR, 'pre-session-reminder.ejs'),
    { slotDateFormatted, slotTimeFormatted, timezone }
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

module.exports = {
  sendReservationConfirmation,
  sendPreSessionReminder,
};
