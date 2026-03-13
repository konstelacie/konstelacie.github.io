const { getPool } = require('../index');

const ACTIVE_STATUSES = ['pending_payment', 'confirmed'];

async function hasActiveReservationForSlot(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const placeholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT id FROM reservations WHERE slot_id = ? AND status IN (${placeholders}) LIMIT 1`,
    [slotId, ...ACTIVE_STATUSES]
  );
  return rows.length > 0;
}

async function create(slotId, userId, email, lockToken) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [result] = await pool.execute(
    `INSERT INTO reservations (slot_id, user_id, email, status, lock_token)
     VALUES (?, ?, ?, 'pending_payment', ?)`,
    [slotId, userId, email, lockToken]
  );
  return result.insertId;
}

async function getById(reservationId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT id, slot_id, user_id, email, status, lock_token, created_at FROM reservations WHERE id = ?',
    [reservationId]
  );
  return rows[0] ?? null;
}

/**
 * Find confirmed reservations with slot starting in ~24h (23h30m–24h30m window).
 * For pre-session reminder job. See docs/SCHEDULED-EMAILS-CRON.md.
 * @returns {Promise<Array<{id, email, slot_id, start_at, end_at, timezone}>>}
 */
async function findDueForPreSessionReminder() {
  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT r.id, r.email, r.slot_id,
            s.start_at, s.end_at, s.timezone
     FROM reservations r
     JOIN slots s ON r.slot_id = s.id
     WHERE r.status = 'confirmed'
       AND s.start_at >= DATE_ADD(NOW(3), INTERVAL '23:30' HOUR_MINUTE)
       AND s.start_at < DATE_ADD(NOW(3), INTERVAL '24:30' HOUR_MINUTE)`
  );
  return rows;
}

module.exports = { hasActiveReservationForSlot, create, getById, findDueForPreSessionReminder };
