const { getPool } = require('../index');

function normalizeEmail(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    sequenceName: row.sequence_name,
    email: row.email,
    assessmentSubmissionId: row.assessment_submission_id,
    currentStep: Number(row.current_step) || 0,
    status: row.status,
    enrolledAt: row.enrolled_at,
    lastSentAt: row.last_sent_at,
    nextSendAt: row.next_send_at,
    completedAt: row.completed_at,
    unsubscribedAt: row.unsubscribed_at,
    cancelledAt: row.cancelled_at,
    primaryBottleneck: row.primary_bottleneck,
    secondaryBottleneck: row.secondary_bottleneck,
    isDualPrimary: Boolean(row.is_dual_primary),
    isBalanced: Boolean(row.is_balanced),
    isLowOverall: Boolean(row.is_low_overall),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {string} sequenceName
 * @param {string} email
 */
async function findBySequenceAndEmail(sequenceName, email) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const [rows] = await pool.execute(
    `SELECT * FROM email_sequence_enrollments
     WHERE sequence_name = ? AND email = ?
     LIMIT 1`,
    [sequenceName, normalizeEmail(email)]
  );
  return mapRow(rows[0]);
}

/**
 * @param {number} id
 */
async function findById(id) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const eid = Math.floor(Number(id));
  if (!Number.isInteger(eid) || eid <= 0) return null;
  const [rows] = await pool.execute(
    `SELECT * FROM email_sequence_enrollments WHERE id = ? LIMIT 1`,
    [eid]
  );
  return mapRow(rows[0]);
}

/**
 * @param {object} input
 * @returns {Promise<{ id: number, created: boolean }>}
 */
async function insertEnrollment(input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const email = normalizeEmail(input.email);
  const enrolledAt = input.enrolledAt instanceof Date ? input.enrolledAt : new Date();
  const nextSendAt = input.nextSendAt instanceof Date ? input.nextSendAt : enrolledAt;

  const [result] = await pool.execute(
    `INSERT INTO email_sequence_enrollments
      (sequence_name, email, assessment_submission_id, current_step, status,
       enrolled_at, next_send_at, primary_bottleneck, secondary_bottleneck,
       is_dual_primary, is_balanced, is_low_overall)
     VALUES (?, ?, ?, 0, 'ACTIVE', ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.sequenceName,
      email,
      input.assessmentSubmissionId,
      enrolledAt,
      nextSendAt,
      input.primaryBottleneck || null,
      input.secondaryBottleneck || null,
      input.isDualPrimary ? 1 : 0,
      input.isBalanced ? 1 : 0,
      input.isLowOverall ? 1 : 0,
    ]
  );

  return { id: Number(result.insertId), created: true };
}

/**
 * Update linked assessment snapshot without changing progression (active sequence).
 */
async function updateAssessmentSnapshot(id, input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  await pool.execute(
    `UPDATE email_sequence_enrollments
     SET assessment_submission_id = ?,
         primary_bottleneck = ?,
         secondary_bottleneck = ?,
         is_dual_primary = ?,
         is_balanced = ?,
         is_low_overall = ?
     WHERE id = ?`,
    [
      input.assessmentSubmissionId,
      input.primaryBottleneck || null,
      input.secondaryBottleneck || null,
      input.isDualPrimary ? 1 : 0,
      input.isBalanced ? 1 : 0,
      input.isLowOverall ? 1 : 0,
      id,
    ]
  );
}

/**
 * Reset a non-active enrollment into a fresh ACTIVE cycle.
 */
async function restartEnrollment(id, input) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const enrolledAt = input.enrolledAt instanceof Date ? input.enrolledAt : new Date();
  const nextSendAt = input.nextSendAt instanceof Date ? input.nextSendAt : enrolledAt;

  await pool.execute(
    `UPDATE email_sequence_enrollments
     SET assessment_submission_id = ?,
         current_step = 0,
         status = 'ACTIVE',
         enrolled_at = ?,
         last_sent_at = NULL,
         next_send_at = ?,
         completed_at = NULL,
         unsubscribed_at = NULL,
         cancelled_at = NULL,
         primary_bottleneck = ?,
         secondary_bottleneck = ?,
         is_dual_primary = ?,
         is_balanced = ?,
         is_low_overall = ?
     WHERE id = ?`,
    [
      input.assessmentSubmissionId,
      enrolledAt,
      nextSendAt,
      input.primaryBottleneck || null,
      input.secondaryBottleneck || null,
      input.isDualPrimary ? 1 : 0,
      input.isBalanced ? 1 : 0,
      input.isLowOverall ? 1 : 0,
      id,
    ]
  );
}

/**
 * Due ACTIVE enrollments with next_send_at <= now.
 * @param {Date} [now]
 * @param {number} [limit=100]
 */
async function findDue(now = new Date(), limit = 100) {
  const pool = getPool();
  if (!pool) return [];

  const lim = Math.min(Math.max(Math.floor(Number(limit)) || 100, 1), 500);
  const [rows] = await pool.execute(
    `SELECT * FROM email_sequence_enrollments
     WHERE status = 'ACTIVE'
       AND next_send_at IS NOT NULL
       AND next_send_at <= ?
     ORDER BY next_send_at ASC
     LIMIT ${lim}`,
    [now]
  );
  return rows.map(mapRow);
}

/**
 * After a successful send of `sentStep`.
 */
async function markStepSent(id, { sentStep, sentAt, nextSendAt, completed }) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  if (completed) {
    await pool.execute(
      `UPDATE email_sequence_enrollments
       SET current_step = ?,
           last_sent_at = ?,
           next_send_at = NULL,
           status = 'COMPLETED',
           completed_at = ?
       WHERE id = ? AND status = 'ACTIVE'`,
      [sentStep, sentAt, sentAt, id]
    );
    return;
  }

  await pool.execute(
    `UPDATE email_sequence_enrollments
     SET current_step = ?,
         last_sent_at = ?,
         next_send_at = ?
     WHERE id = ? AND status = 'ACTIVE'`,
    [sentStep, sentAt, nextSendAt, id]
  );
}

async function markUnsubscribed(id, at = new Date()) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  await pool.execute(
    `UPDATE email_sequence_enrollments
     SET status = 'UNSUBSCRIBED',
         unsubscribed_at = ?,
         next_send_at = NULL
     WHERE id = ?
       AND status IN ('ACTIVE', 'PAUSED')`,
    [at, id]
  );
}

/**
 * Admin / ops: stop sequence without unsubscribe (e.g. booked diagnosis).
 */
async function markCancelled(id, at = new Date()) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  await pool.execute(
    `UPDATE email_sequence_enrollments
     SET status = 'CANCELLED',
         cancelled_at = ?,
         next_send_at = NULL
     WHERE id = ?
       AND status IN ('ACTIVE', 'PAUSED')`,
    [at, id]
  );
}

/**
 * Unsubscribe all ACTIVE/PAUSED enrollments for an email (any sequence).
 */
async function unsubscribeAllForEmail(email, at = new Date()) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const [result] = await pool.execute(
    `UPDATE email_sequence_enrollments
     SET status = 'UNSUBSCRIBED',
         unsubscribed_at = ?,
         next_send_at = NULL
     WHERE email = ?
       AND status IN ('ACTIVE', 'PAUSED')`,
    [at, normalizeEmail(email)]
  );
  return result.affectedRows || 0;
}

module.exports = {
  findBySequenceAndEmail,
  findById,
  insertEnrollment,
  updateAssessmentSnapshot,
  restartEnrollment,
  findDue,
  markStepSent,
  markUnsubscribed,
  markCancelled,
  unsubscribeAllForEmail,
  mapRow,
  normalizeEmail,
};
