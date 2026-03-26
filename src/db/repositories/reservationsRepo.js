const { DateTime } = require('luxon');
const { SLOT_TIMEZONE } = require('../../config/slotGrid');
const paymentsRepo = require('./paymentsRepo');
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
            funnel_name, funnel_campaign, funnel_video_id, created_at, cancelled_at, admin_note
     FROM reservations WHERE id = ?`,
    [reservationId]
  );
  return rows[0] ?? null;
}

/**
 * Full reservation + slot + payments for admin detail screen.
 * @returns {Promise<null | { reservation: object, slot: object, payments: object[] }>}
 */
async function getAdminDetailById(reservationId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT r.id, r.slot_id, r.user_id, r.email, r.status, r.payment_type, r.lock_token,
            r.funnel_name, r.funnel_campaign, r.funnel_video_id,
            r.cancelled_at, r.created_at, r.updated_at, r.admin_note,
            s.local_date, s.grid_index, s.start_at_utc, s.end_at_utc, s.timezone, s.status AS slot_status
     FROM reservations r
     INNER JOIN slots s ON s.id = r.slot_id
     WHERE r.id = ?`,
    [reservationId]
  );
  if (!rows[0]) return null;

  const row = rows[0];
  const payments = await paymentsRepo.listByReservationId(reservationId);

  return {
    reservation: {
      id: row.id,
      slot_id: row.slot_id,
      user_id: row.user_id,
      email: row.email,
      status: row.status,
      payment_type: row.payment_type,
      lock_token: row.lock_token,
      funnel_name: row.funnel_name,
      funnel_campaign: row.funnel_campaign,
      funnel_video_id: row.funnel_video_id,
      cancelled_at: row.cancelled_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
      admin_note: row.admin_note,
    },
    slot: {
      local_date: row.local_date,
      grid_index: row.grid_index,
      start_at_utc: row.start_at_utc,
      end_at_utc: row.end_at_utc,
      timezone: row.timezone,
      slot_status: row.slot_status,
    },
    payments,
  };
}

async function adminConfirmReservation(reservationId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [result] = await pool.execute(
    `UPDATE reservations SET status = 'confirmed' WHERE id = ? AND status IN ('pending_payment','draft')`,
    [reservationId]
  );
  if (result.affectedRows === 0) return { ok: false, code: 'INVALID_STATE' };
  return { ok: true };
}

async function adminCancelReservation(reservationId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [result] = await pool.execute(
    `UPDATE reservations SET status = 'cancelled', cancelled_at = COALESCE(cancelled_at, NOW(3))
     WHERE id = ? AND status IN ('pending_payment','draft','confirmed','expired')`,
    [reservationId]
  );
  if (result.affectedRows === 0) return { ok: false, code: 'INVALID_STATE' };
  return { ok: true };
}

async function adminAppendExternalNote(reservationId, note) {
  const noteTrim = typeof note === 'string' ? note.trim() : '';
  if (!noteTrim) return { ok: false, code: 'EMPTY_NOTE' };

  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute('SELECT id, admin_note FROM reservations WHERE id = ?', [reservationId]);
  if (!rows[0]) return { ok: false, code: 'NOT_FOUND' };

  const stamp = DateTime.now().setZone(SLOT_TIMEZONE).toFormat('yyyy-MM-dd HH:mm');
  const line = `Externé vybavenie (${stamp}): ${noteTrim}`;
  const merged = rows[0].admin_note ? `${rows[0].admin_note}\n\n${line}` : line;
  await pool.execute('UPDATE reservations SET admin_note = ? WHERE id = ?', [merged, reservationId]);
  return { ok: true };
}

async function adminSetNote(reservationId, note) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute('SELECT id FROM reservations WHERE id = ?', [reservationId]);
  if (!rows[0]) return { ok: false, code: 'NOT_FOUND' };

  const text = typeof note === 'string' ? note.trim() : '';
  await pool.execute('UPDATE reservations SET admin_note = ? WHERE id = ?', [text || null, reservationId]);
  return { ok: true };
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
  getAdminDetailById,
  adminConfirmReservation,
  adminCancelReservation,
  adminAppendExternalNote,
  adminSetNote,
};
