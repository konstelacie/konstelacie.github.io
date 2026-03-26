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
    `SELECT id, slot_id, user_id, email, status, lock_token,
            funnel_name, funnel_campaign, funnel_video_id, created_at
     FROM reservations WHERE id = ?`,
    [reservationId]
  );
  return rows[0] ?? null;
}

/**
 * Find confirmed reservations with slot starting in ~24h (23h30m–24h30m window).
 * For pre-session reminder job. See docs/SCHEDULED-EMAILS-CRON.md.
 * @returns {Promise<Array<{id, email, slot_id, start_at_utc, end_at_utc, timezone}>>}
 */
async function findDueForPreSessionReminder() {
  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT r.id, r.email, r.slot_id,
            s.start_at_utc, s.end_at_utc, s.timezone
     FROM reservations r
     JOIN slots s ON r.slot_id = s.id
     WHERE r.status = 'confirmed'
       AND s.start_at_utc >= DATE_ADD(NOW(3), INTERVAL '23:30' HOUR_MINUTE)
       AND s.start_at_utc < DATE_ADD(NOW(3), INTERVAL '24:30' HOUR_MINUTE)`
  );
  return rows;
}

/**
 * Admin list with slot + latest payment summary.
 * @param {{ filter: string, todayStartUtc?: Date, todayEndUtc?: Date }} opts
 */
async function listForAdmin(opts) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const { filter, todayStartUtc, todayEndUtc } = opts;
  let extraWhere = '';
  const params = [];

  switch (filter) {
    case 'today':
      extraWhere = 'AND s.start_at_utc >= ? AND s.start_at_utc <= ?';
      params.push(todayStartUtc, todayEndUtc);
      break;
    case 'upcoming':
      extraWhere = 'AND s.start_at_utc >= NOW(3)';
      break;
    case 'unpaid':
      extraWhere = "AND r.status = 'pending_payment'";
      break;
    case 'confirmed':
      extraWhere = "AND r.status = 'confirmed'";
      break;
    case 'expired':
      extraWhere = `AND (
        r.status = 'expired'
        OR (
          r.status = 'pending_payment'
          AND (SELECT p.status FROM payments p WHERE p.reservation_id = r.id ORDER BY p.created_at DESC LIMIT 1) = 'expired'
        )
      )`;
      break;
    default:
      extraWhere = 'AND s.start_at_utc >= NOW(3)';
  }

  const [rows] = await pool.execute(
    `SELECT
      r.id,
      r.email,
      r.status AS reservation_status,
      r.created_at,
      s.local_date,
      s.grid_index,
      s.start_at_utc,
      s.timezone,
      (SELECT p.status FROM payments p WHERE p.reservation_id = r.id ORDER BY p.created_at DESC LIMIT 1) AS payment_status,
      (SELECT p.amount_cents FROM payments p WHERE p.reservation_id = r.id ORDER BY p.created_at DESC LIMIT 1) AS amount_cents
    FROM reservations r
    INNER JOIN slots s ON r.slot_id = s.id
    WHERE 1 = 1
    ${extraWhere}
    ORDER BY s.start_at_utc DESC, r.id DESC
    LIMIT 500`,
    params
  );

  return rows;
}

module.exports = {
  hasActiveReservationForSlot,
  create,
  getById,
  findDueForPreSessionReminder,
  listForAdmin,
};
