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

module.exports = { listSlotsWithLocks, getById };
