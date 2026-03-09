const config = require('../config');

function isConfigured() {
  return !!(config.email?.resend?.apiKey && config.email?.resend?.fromEmail);
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
  // TODO: call Resend API
  throw new Error('Not implemented');
}

module.exports = { sendEmail, isConfigured };
