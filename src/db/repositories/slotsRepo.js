const { getPool } = require('../index');

/**
 * List slots in [from, to] by calendar local_date (Europe/Bratislava business dates),
 * with lock info. Only slots with start_at_utc at least 24h from now.
 * from/to are ISO date strings (YYYY-MM-DD).
 */
async function listSlotsWithLocks(from, to) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT
      s.id,
      s.local_date,
      s.grid_index,
      s.start_at_utc,
      s.end_at_utc,
      s.timezone,
      s.status,
      s.capacity,
      l.id AS lock_id,
      l.lock_token,
      l.expires_at AS lock_expires_at
    FROM slots s
    LEFT JOIN slot_locks l ON l.slot_id = s.id AND l.expires_at > NOW(3)
    WHERE s.local_date >= ?
      AND s.local_date <= ?
      AND s.start_at_utc >= DATE_ADD(NOW(3), INTERVAL 24 HOUR)
    ORDER BY s.local_date ASC, s.grid_index ASC`,
    [from, to]
  );

  return rows;
}

async function getById(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT id, local_date, grid_index, start_at_utc, end_at_utc, timezone, status, capacity
     FROM slots WHERE id = ?`,
    [slotId]
  );
  return rows[0] ?? null;
}

/**
 * Admin listing: all slots in [from, to] by local_date (no public 24h booking window filter).
 * Includes active lock and active reservation (pending_payment | confirmed) for display.
 * from/to: ISO date strings YYYY-MM-DD.
 */
async function listSlotsForAdmin(from, to) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT
      s.id,
      s.local_date,
      s.grid_index,
      s.start_at_utc,
      s.end_at_utc,
      s.timezone,
      s.status AS slot_status,
      s.capacity,
      l.id AS lock_id,
      l.email AS lock_email,
      l.expires_at AS lock_expires_at,
      r.id AS reservation_id,
      r.email AS reservation_email,
      r.status AS reservation_status
    FROM slots s
    LEFT JOIN slot_locks l ON l.slot_id = s.id AND l.expires_at > NOW(3)
    LEFT JOIN reservations r
      ON r.slot_id = s.id AND r.status IN ('draft', 'pending_payment', 'confirmed')
    WHERE s.local_date >= ?
      AND s.local_date <= ?
    ORDER BY s.local_date ASC, s.grid_index ASC`,
    [from, to]
  );

  return rows;
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function adminBlockSlot(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id, status FROM slots WHERE id = ? FOR UPDATE', [slotId]);
    const slot = rows[0];
    if (!slot) {
      await conn.rollback();
      return { ok: false, code: 'NOT_FOUND' };
    }
    if (slot.status !== 'open') {
      await conn.rollback();
      return { ok: false, code: 'INVALID_STATE' };
    }

    const [resRows] = await conn.execute(
      "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('draft','pending_payment','confirmed') LIMIT 1",
      [slotId]
    );
    if (resRows.length > 0) {
      await conn.rollback();
      return { ok: false, code: 'HAS_RESERVATION' };
    }

    await conn.execute('DELETE FROM slot_locks WHERE slot_id = ?', [slotId]);
    await conn.execute("UPDATE slots SET status = 'blocked' WHERE id = ?", [slotId]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function adminUnblockSlot(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id, status FROM slots WHERE id = ? FOR UPDATE', [slotId]);
    const slot = rows[0];
    if (!slot) {
      await conn.rollback();
      return { ok: false, code: 'NOT_FOUND' };
    }
    if (slot.status !== 'blocked') {
      await conn.rollback();
      return { ok: false, code: 'INVALID_STATE' };
    }

    await conn.execute("UPDATE slots SET status = 'open' WHERE id = ?", [slotId]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Cancels the slot and any non-terminal reservations; removes locks.
 * @returns {Promise<{ ok: true } | { ok: false, code: string }>}
 */
async function adminCancelSlot(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.execute('SELECT id, status FROM slots WHERE id = ? FOR UPDATE', [slotId]);
    const slot = rows[0];
    if (!slot) {
      await conn.rollback();
      return { ok: false, code: 'NOT_FOUND' };
    }
    if (slot.status === 'cancelled') {
      await conn.rollback();
      return { ok: false, code: 'ALREADY_CANCELLED' };
    }

    await conn.execute(
      `UPDATE reservations
       SET status = 'cancelled', cancelled_at = NOW(3)
       WHERE slot_id = ? AND status IN ('draft','pending_payment','confirmed')`,
      [slotId]
    );
    await conn.execute('DELETE FROM slot_locks WHERE slot_id = ?', [slotId]);
    await conn.execute("UPDATE slots SET status = 'cancelled' WHERE id = ?", [slotId]);
    await conn.commit();
    return { ok: true };
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = {
  listSlotsWithLocks,
  getById,
  listSlotsForAdmin,
  adminBlockSlot,
  adminUnblockSlot,
  adminCancelSlot,
};
