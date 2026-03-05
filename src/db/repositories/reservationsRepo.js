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

module.exports = { hasActiveReservationForSlot, create, getById };
