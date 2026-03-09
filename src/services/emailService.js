const path = require('path');
const ejs = require('ejs');
const emailProvider = require('../email/provider');

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

  return emailProvider.sendEmail(to, 'Rezervácia potvrdená', html, metadata);
}

module.exports = {
  sendReservationConfirmation,
};
