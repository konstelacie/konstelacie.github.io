const { getPool } = require('../index');
const { logLine } = require('../../lib/structuredLog');

/**
 * @typedef {Object} LeadEventPayload
 * @property {string} email
 * @property {string|null} [formId]
 * @property {string|null} [sourceUrl]
 * @property {number|null} [amount] euros
 * @property {string|null} [currency]
 * @property {number|null} [slotId]
 * @property {number|null} [reservationId]
 * @property {number|null} [paymentId]
 * @property {string|null} [providerEventId]
 * @property {Date|string|null} [occurredAt]
 * @property {object|null} [metadata]
 * @property {boolean|null} [consentMarketing]
 */

/**
 * Insert a lead event on a separate pool connection. Never throws — failures are logged and swallowed.
 * @param {string} eventType
 * @param {LeadEventPayload} [payload]
 * @returns {Promise<void>}
 */
async function recordLeadEvent(eventType, payload) {
  try {
    const pool = getPool();
    if (!pool) return;

    const email = String(payload?.email ?? '')
      .trim()
      .toLowerCase();
    if (!email) return;

    const metadataJson = payload.metadata != null ? JSON.stringify(payload.metadata) : null;
    const occurredAt =
      payload.occurredAt instanceof Date
        ? payload.occurredAt
        : payload.occurredAt
          ? new Date(payload.occurredAt)
          : new Date();

    await pool.execute(
      `INSERT INTO lead_events (
        email, event_type, form_id, source_url, amount, currency,
        slot_id, reservation_id, payment_id, provider_event_id,
        occurred_at, metadata, consent_marketing
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE id = id`,
      [
        email,
        eventType,
        payload.formId ?? null,
        payload.sourceUrl ?? null,
        payload.amount != null ? payload.amount : null,
        payload.currency ?? null,
        payload.slotId ?? null,
        payload.reservationId ?? null,
        payload.paymentId ?? null,
        payload.providerEventId ?? null,
        occurredAt,
        metadataJson,
        payload.consentMarketing == null ? null : payload.consentMarketing ? 1 : 0,
      ]
    );
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'lead_events_insert_failed',
      eventType,
      email: payload?.email,
      error: err?.message || String(err),
    });
  }
}

/**
 * Fire-and-forget lead event write (non-blocking for request handlers).
 * @param {string} eventType
 * @param {LeadEventPayload} [payload]
 */
function scheduleLeadEvent(eventType, payload) {
  try {
    void recordLeadEvent(eventType, payload);
  } catch (err) {
    logLine({
      level: 'warn',
      tag: 'lead_events_schedule_failed',
      eventType,
      error: err?.message || String(err),
    });
  }
}

module.exports = {
  recordLeadEvent,
  scheduleLeadEvent,
};
