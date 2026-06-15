const { getPool } = require('../index');

const RESERVATION_CONFIRMATION_TEMPLATE = 'reservation-confirmation';
const ENTITY_TYPE_RESERVATION = 'reservation';

/**
 * Insert reservation confirmation email task inside a caller-held transaction.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function insertReservationConfirmation(conn, {
  paymentId,
  reservationId,
  recipientEmail,
  maxAttempts = 5,
}) {
  const [result] = await conn.execute(
    `INSERT INTO email_delivery_tasks
       (template_id, entity_type, entity_id, payment_id, reservation_id, recipient_email, max_attempts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      RESERVATION_CONFIRMATION_TEMPLATE,
      ENTITY_TYPE_RESERVATION,
      reservationId,
      paymentId,
      reservationId,
      recipientEmail,
      maxAttempts,
    ]
  );
  return result.insertId;
}

async function findById(id) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT id, template_id, entity_type, entity_id, payment_id, reservation_id, recipient_email,
            status, attempt_count, max_attempts, last_attempt_at, next_attempt_at, last_error,
            provider_message_id, created_at, updated_at, sent_at
     FROM email_delivery_tasks
     WHERE id = ?
     LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

/**
 * Atomically claim a task for sending.
 * @returns {Promise<boolean>}
 */
async function claimForSending(id) {
  const pool = getPool();
  if (!pool) return false;

  const [result] = await pool.execute(
    `UPDATE email_delivery_tasks
     SET status = 'sending', last_attempt_at = NOW(3)
     WHERE id = ?
       AND status IN ('pending', 'failed')
       AND attempt_count < max_attempts`,
    [id]
  );
  return result.affectedRows > 0;
}

async function markSent(id, providerMessageId) {
  const pool = getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE email_delivery_tasks
     SET status = 'sent', sent_at = NOW(3), provider_message_id = ?, last_error = NULL
     WHERE id = ?`,
    [providerMessageId ?? null, id]
  );
}

async function markFailed(id, { attemptCount, lastError, nextAttemptAt }) {
  const pool = getPool();
  if (!pool) return;

  await pool.execute(
    `UPDATE email_delivery_tasks
     SET status = 'failed',
         attempt_count = ?,
         last_error = ?,
         next_attempt_at = ?,
         last_attempt_at = NOW(3)
     WHERE id = ?`,
    [attemptCount, lastError ?? null, nextAttemptAt, id]
  );
}

/**
 * @param {number} [limit=50]
 */
async function findDue(limit = 50) {
  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT id, template_id, entity_type, entity_id, payment_id, reservation_id, recipient_email,
            status, attempt_count, max_attempts, last_attempt_at, next_attempt_at, last_error,
            provider_message_id, created_at, updated_at, sent_at
     FROM email_delivery_tasks
     WHERE status IN ('pending', 'failed')
       AND attempt_count < max_attempts
       AND (next_attempt_at IS NULL OR next_attempt_at <= NOW(3))
     ORDER BY COALESCE(next_attempt_at, created_at) ASC
     LIMIT ?`,
    [limit]
  );
  return rows;
}

module.exports = {
  RESERVATION_CONFIRMATION_TEMPLATE,
  ENTITY_TYPE_RESERVATION,
  insertReservationConfirmation,
  findById,
  claimForSending,
  markSent,
  markFailed,
  findDue,
};
