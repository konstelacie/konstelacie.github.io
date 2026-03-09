const { Resend } = require('resend');
const config = require('../config');

const resend = new Resend(config.email?.resend?.apiKey || '');

function isConfigured() {
  return !!(config.email?.resend?.apiKey && config.email?.resend?.fromEmail);
}

function buildFrom() {
  const { fromName, fromEmail } = config.email?.resend || {};
  return fromName && fromEmail ? `${fromName} <${fromEmail}>` : '';
}

/**
 * Send transactional email via Resend.
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} html - HTML body
 * @param {object} [metadata] - Optional metadata (e.g. entity_type, entity_id for logging)
 * @returns {Promise<{ok: boolean, skipped?: boolean, messageId?: string}>}
 */
async function sendEmail(to, subject, html, metadata = {}) {
  if (!isConfigured()) {
    console.warn('[email] Resend not configured; skipping send');
    return { ok: false, skipped: true };
  }

  const from = buildFrom();
  const replyTo = config.email?.resend?.fromEmail || '';

  const { data, error } = await resend.emails.send({
    from,
    to,
    reply_to: replyTo,
    subject,
    html,
  });

  if (error) {
    console.error('[email] Resend send failed:', error);
    return { ok: false };
  }

  return { ok: true, messageId: data?.id };
}

module.exports = { sendEmail, isConfigured };
