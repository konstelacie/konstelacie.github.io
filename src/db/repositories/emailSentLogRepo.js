const { getPool } = require('../index');

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

module.exports = { log, wasAlreadySent };
