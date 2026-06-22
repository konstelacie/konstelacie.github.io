const { getPool } = require('../index');

const CONFIRMATION_TEMPLATE_IDS = ['reservation-confirmation', 'reservation-confirmation-resend'];
const BOUNCED_DELIVERY_STATUSES = new Set(['bounced', 'complained']);

/**
 * Log a sent email to the audit trail.
 * @param {object} params
 * @param {string} params.recipientEmail - Recipient email address
 * @param {string} params.templateId - Template identifier (e.g. 'reservation-confirmation')
 * @param {string} [params.entityType] - Entity type (e.g. 'reservation')
 * @param {number} [params.entityId] - Entity ID
 * @param {string} [params.providerMessageId] - Provider message ID from Resend
 * @param {string} [params.actorType='system'] - Actor type (anon, user, admin, system)
 * @param {number} [params.actorId] - Actor ID
 */
async function log({ recipientEmail, templateId, entityType, entityId, providerMessageId, actorType = 'system', actorId }) {
  const pool = getPool();
  if (!pool) return;

  await pool.execute(
    `INSERT INTO email_sent_log (recipient_email, template_id, entity_type, entity_id, provider_message_id, actor_type, actor_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [recipientEmail, templateId, entityType ?? null, entityId ?? null, providerMessageId ?? null, actorType, actorId ?? null]
  );
}

/**
 * Check if an email was already sent for a given entity (idempotency).
 * @param {string} templateId - Template identifier (e.g. 'pre-session-reminder')
 * @param {string} entityType - Entity type (e.g. 'reservation')
 * @param {number} entityId - Entity ID
 * @returns {Promise<boolean>} True if already sent
 */
async function wasAlreadySent(templateId, entityType, entityId) {
  const pool = getPool();
  if (!pool) return false;

  const [rows] = await pool.execute(
    `SELECT 1 FROM email_sent_log
     WHERE template_id = ? AND entity_type = ? AND entity_id = ?
     LIMIT 1`,
    [templateId, entityType, entityId]
  );
  return rows.length > 0;
}

/**
 * @param {string} messageId - Resend provider message ID
 * @returns {Promise<object|null>}
 */
async function findByProviderMessageId(messageId) {
  const pool = getPool();
  if (!pool || !messageId) return null;

  const [rows] = await pool.execute(
    `SELECT id, recipient_email, template_id, entity_type, entity_id, provider_message_id,
            delivery_status, bounce_reason, bounced_at
     FROM email_sent_log
     WHERE provider_message_id = ?
     LIMIT 1`,
    [messageId]
  );
  return rows[0] || null;
}

/**
 * Mark a logged email as bounced or complained. Idempotent when already bounced/complained.
 * @param {string} messageId
 * @param {{ status: 'bounced'|'complained', reason?: string|null }} params
 * @returns {Promise<{ updated: boolean, row: object|null }>}
 */
async function markBounced(messageId, { status, reason }) {
  const pool = getPool();
  if (!pool || !messageId) return { updated: false, row: null };

  const existing = await findByProviderMessageId(messageId);
  if (!existing) {
    return { updated: false, row: null };
  }

  if (BOUNCED_DELIVERY_STATUSES.has(existing.delivery_status)) {
    return { updated: false, row: existing };
  }

  const bounceReason = reason != null && String(reason).trim() !== '' ? String(reason).trim() : null;

  const [result] = await pool.execute(
    `UPDATE email_sent_log
     SET delivery_status = ?, bounce_reason = ?, bounced_at = NOW(3)
     WHERE provider_message_id = ? AND delivery_status NOT IN ('bounced', 'complained')`,
    [status, bounceReason, messageId]
  );

  const row = await findByProviderMessageId(messageId);
  return { updated: result.affectedRows > 0, row };
}

/**
 * @param {string} messageId
 * @returns {Promise<{ updated: boolean, row: object|null }>}
 */
async function markDelivered(messageId) {
  const pool = getPool();
  if (!pool || !messageId) return { updated: false, row: null };

  const existing = await findByProviderMessageId(messageId);
  if (!existing) {
    return { updated: false, row: null };
  }

  if (existing.delivery_status === 'delivered' || BOUNCED_DELIVERY_STATUSES.has(existing.delivery_status)) {
    return { updated: false, row: existing };
  }

  await pool.execute(
    `UPDATE email_sent_log
     SET delivery_status = 'delivered'
     WHERE provider_message_id = ? AND delivery_status = 'accepted'`,
    [messageId]
  );

  const row = await findByProviderMessageId(messageId);
  return { updated: true, row };
}

/**
 * Latest confirmation-related send for an entity (newest log row wins).
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<object|null>}
 */
async function findLatestConfirmationLogForEntity(entityType, entityId) {
  const pool = getPool();
  if (!pool || !entityType || entityId == null) return null;

  const placeholders = CONFIRMATION_TEMPLATE_IDS.map(() => '?').join(', ');
  const [rows] = await pool.execute(
    `SELECT recipient_email, delivery_status, bounce_reason, bounced_at, provider_message_id, template_id
     FROM email_sent_log
     WHERE entity_type = ? AND entity_id = ?
       AND template_id IN (${placeholders})
     ORDER BY sent_at DESC, id DESC
     LIMIT 1`,
    [entityType, entityId, ...CONFIRMATION_TEMPLATE_IDS]
  );
  return rows[0] || null;
}

/**
 * @param {number} reservationId
 * @returns {Promise<object|null>}
 */
async function findLatestConfirmationLogForReservation(reservationId) {
  return findLatestConfirmationLogForEntity('reservation', reservationId);
}

/**
 * Whether the latest confirmation-related send for an entity is bounced/complained.
 * Uses the most recent log row (successful admin resend supersedes an earlier bounce).
 * @param {string} entityType
 * @param {number} entityId
 * @returns {Promise<boolean>}
 */
async function isBouncedForEntity(entityType, entityId) {
  const row = await findLatestConfirmationLogForEntity(entityType, entityId);
  return BOUNCED_DELIVERY_STATUSES.has(row?.delivery_status);
}

module.exports = {
  CONFIRMATION_TEMPLATE_IDS,
  log,
  wasAlreadySent,
  findByProviderMessageId,
  markBounced,
  markDelivered,
  isBouncedForEntity,
  findLatestConfirmationLogForEntity,
  findLatestConfirmationLogForReservation,
};
