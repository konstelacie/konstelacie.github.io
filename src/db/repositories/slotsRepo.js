const { SLOT_TIMEZONE } = require('../../config/slotGrid');
const { computeUtcRangeForCell } = require('../../lib/slotInstants');
const { mysqlLocalDateToYmd } = require('../../lib/slotApiMap');
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

/**
 * Insert one open slot for (local_date, grid_index). Fails on duplicate cell.
 * @returns {Promise<{ ok: true, id: number } | { ok: false, code: 'DUPLICATE' }>}
 */
async function insertOpenSlot(localDate, gridIndex) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const { startUtc, endUtc } = computeUtcRangeForCell(localDate, gridIndex);

  try {
    const [result] = await pool.execute(
      `INSERT INTO slots (local_date, grid_index, timezone, start_at_utc, end_at_utc, status, capacity)
       VALUES (?, ?, ?, ?, ?, 'open', 1)`,
      [localDate, gridIndex, SLOT_TIMEZONE, startUtc, endUtc]
    );
    return { ok: true, id: result.insertId };
  } catch (e) {
    if (e.code === 'ER_DUP_ENTRY' || e.errno === 1062) {
      return { ok: false, code: 'DUPLICATE' };
    }
    throw e;
  }
}

/**
 * All (local_date, grid_index) pairs in range for duplicate checks.
 * @returns {Promise<Set<string>>} keys `YYYY-MM-DD|gridIndex`
 */
/** Distinct local_date values that have at least one slot row in [from, to] (YYYY-MM-DD). */
async function listLocalDatesWithAnySlot(from, to) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT DISTINCT local_date FROM slots WHERE local_date >= ? AND local_date <= ? ORDER BY local_date',
    [from, to]
  );
  return rows.map((r) => mysqlLocalDateToYmd(r.local_date));
}

async function listSlotsCellsInRange(from, to) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT local_date, grid_index FROM slots WHERE local_date >= ? AND local_date <= ?',
    [from, to]
  );
  const set = new Set();
  for (const r of rows) {
    set.add(`${mysqlLocalDateToYmd(r.local_date)}|${r.grid_index}`);
  }
  return set;
}

/**
 * Insert many open slots in one transaction (preview already filtered duplicates).
 * @param {Array<{ localDate: string, gridIndex: number }>} cells
 */
async function bulkInsertOpenSlots(cells) {
  if (!cells.length) return { created: 0 };

  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    let n = 0;
    for (const cell of cells) {
      const { startUtc, endUtc } = computeUtcRangeForCell(cell.localDate, cell.gridIndex);
      await conn.execute(
        `INSERT INTO slots (local_date, grid_index, timezone, start_at_utc, end_at_utc, status, capacity)
         VALUES (?, ?, ?, ?, ?, 'open', 1)`,
        [cell.localDate, cell.gridIndex, SLOT_TIMEZONE, startUtc, endUtc]
      );
      n += 1;
    }
    await conn.commit();
    return { created: n };
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
  insertOpenSlot,
  listSlotsCellsInRange,
  listLocalDatesWithAnySlot,
  bulkInsertOpenSlots,
};
