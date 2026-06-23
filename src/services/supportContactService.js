const config = require('../config');
const emailProvider = require('../email/provider');
const { ApiError } = require('../middleware/apiError');
const reservationsRepo = require('../db/repositories/reservationsRepo');
const paymentsRepo = require('../db/repositories/paymentsRepo');

const MAX_MESSAGE_LEN = 2000;
const MIN_MESSAGE_LEN = 5;
const MAX_PHONE_LEN = 30;
const MAX_CONTEXT_LEN = 64;
const MAX_RESERVATION_ID_LEN = 32;
const MAX_CHECKOUT_SESSION_ID_LEN = 128;
const MAX_RECIPIENT_MASKED_LEN = 120;

const PHONE_PATTERN = /^[\d\s+()\-./]+$/;

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function plainTextToHtmlParagraphs(text) {
  const blocks = String(text).split(/\n{2,}/);
  const parts = [];
  for (const block of blocks) {
    const b = block.trim();
    if (!b) continue;
    const withBr = escapeHtml(b).replace(/\n/g, '<br>');
    parts.push(`<p style="margin:0 0 12px;">${withBr}</p>`);
  }
  return parts.length ? parts.join('') : '<p style="margin:0 0 12px;">—</p>';
}

function normalizeOptionalString(raw, maxLen) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function validateMessage(raw) {
  const message = typeof raw === 'string' ? raw.trim() : '';
  if (!message || message.length < MIN_MESSAGE_LEN) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Správa musí mať aspoň 5 znakov.',
      400
    );
  }
  if (message.length > MAX_MESSAGE_LEN) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `Správa môže mať najviac ${MAX_MESSAGE_LEN} znakov.`,
      400
    );
  }
  return message;
}

function validatePhone(raw) {
  const phone = normalizeOptionalString(raw, MAX_PHONE_LEN);
  if (!phone) return null;
  if (!PHONE_PATTERN.test(phone)) {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Telefón obsahuje nepovolené znaky.',
      400
    );
  }
  return phone;
}

function validateCheckoutSessionId(raw) {
  const id = normalizeOptionalString(raw, MAX_CHECKOUT_SESSION_ID_LEN);
  if (!id) return null;
  if (!id.startsWith('cs_')) {
    throw new ApiError('VALIDATION_ERROR', 'Neplatný identifikátor platby.', 400);
  }
  return id;
}

function buildSupportEmailSubject(reservationId) {
  const base = 'Podpora – potvrdenie rezervácie';
  return reservationId ? `${base} [${reservationId}]` : base;
}

function buildSupportEmailHtml({
  message,
  phone,
  reservationId,
  reservationIdUnverified,
  checkoutSessionId,
  context,
  recipientMasked,
}) {
  const rows = [
    ['Správa od používateľa', plainTextToHtmlParagraphs(message)],
    phone ? ['Telefón', escapeHtml(phone)] : null,
    recipientMasked ? ['E-mail (maskovaný)', escapeHtml(recipientMasked)] : null,
    reservationId ? ['ID rezervácie', escapeHtml(reservationId)] : null,
    reservationIdUnverified
      ? ['ID rezervácie (neoverené)', escapeHtml(reservationIdUnverified)]
      : null,
    checkoutSessionId ? ['Stripe checkout session', escapeHtml(checkoutSessionId)] : null,
    context ? ['Kontext (stránka)', escapeHtml(context)] : null,
  ].filter(Boolean);

  const bodyRows = rows
    .map(([label, value]) => {
      return (
        `<tr>` +
        `<td style="padding:8px 12px 8px 0;vertical-align:top;font-weight:600;color:#334155;white-space:nowrap;">${escapeHtml(label)}</td>` +
        `<td style="padding:8px 0;vertical-align:top;color:#0f172a;">${value}</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    '<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#0f172a;">' +
    '<p style="margin:0 0 16px;">Nová správa z formulára podpory na stránke po platbe.</p>' +
    `<table style="border-collapse:collapse;width:100%;max-width:560px;">${bodyRows}</table>` +
    '</div>'
  );
}

/**
 * @returns {Promise<{ verified: string|null, unverified: string|null }>}
 */
async function resolveReservationIdForEmail(rawId) {
  const normalized = normalizeOptionalString(rawId, MAX_RESERVATION_ID_LEN);
  if (!normalized) return { verified: null, unverified: null };

  const numericId = Number(normalized);
  if (!Number.isInteger(numericId) || numericId < 1) {
    return { verified: null, unverified: normalized };
  }

  try {
    const row = await reservationsRepo.getById(numericId);
    if (row) return { verified: String(numericId), unverified: null };
    return { verified: null, unverified: null };
  } catch (err) {
    console.error('[support] reservation lookup failed, falling back to unverified', err);
    return { verified: null, unverified: normalized };
  }
}

/**
 * @returns {Promise<string|null>}
 */
async function resolveCheckoutSessionIdForEmail(rawId) {
  const id = normalizeOptionalString(rawId, MAX_CHECKOUT_SESSION_ID_LEN);
  if (!id || !id.startsWith('cs_')) return null;
  try {
    const payment = await paymentsRepo.findByProviderRef(id);
    return payment ? id : null;
  } catch (err) {
    console.error('[support] checkout session lookup failed, omitting from email', err);
    return null;
  }
}

/**
 * @param {object} input
 * @param {string} input.message
 * @param {string} [input.phone]
 * @param {string} [input.reservationId]
 * @param {string} [input.checkoutSessionId]
 * @param {string} [input.context]
 * @param {string} [input.recipientMasked]
 */
async function sendSupportContact(input) {
  const message = validateMessage(input?.message);
  const phone = validatePhone(input?.phone);
  const { verified: reservationId, unverified: reservationIdUnverified } =
    await resolveReservationIdForEmail(input?.reservationId);
  const checkoutSessionId = await resolveCheckoutSessionIdForEmail(input?.checkoutSessionId);
  const context = normalizeOptionalString(input?.context, MAX_CONTEXT_LEN);
  const recipientMasked = normalizeOptionalString(input?.recipientMasked, MAX_RECIPIENT_MASKED_LEN);

  const to = config.site?.supportEmail;
  if (!to) {
    console.error('[support] SUPPORT_EMAIL not configured');
    throw new ApiError('SERVICE_UNAVAILABLE', 'Podpora momentálne nie je dostupná.', 503);
  }

  const subject = buildSupportEmailSubject(reservationId);
  const html = buildSupportEmailHtml({
    message,
    phone,
    reservationId,
    reservationIdUnverified,
    checkoutSessionId,
    context,
    recipientMasked,
  });

  const result = await emailProvider.sendEmail(to, subject, html, {
    entity_type: 'support_contact',
    context: context || 'unknown',
  });

  if (result.skipped) {
    console.error('[support] Email provider not configured');
    throw new ApiError('SERVICE_UNAVAILABLE', 'Odoslanie správy zlyhalo. Skús to prosím neskôr.', 503);
  }

  if (!result.ok) {
    console.error('[support] Failed to send support contact email', {
      reservationId,
      checkoutSessionId,
      context,
    });
    throw new ApiError('SEND_FAILED', 'Odoslanie správy zlyhalo. Skús to prosím neskôr.', 502);
  }

  return { ok: true };
}

module.exports = {
  sendSupportContact,
  resolveReservationIdForEmail,
  resolveCheckoutSessionIdForEmail,
  validateMessage,
  validatePhone,
  validateCheckoutSessionId,
  buildSupportEmailSubject,
  buildSupportEmailHtml,
};
