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

module.exports = { log };
