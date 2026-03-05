const { getPool } = require('../index');

/**
 * List slots in [from, to+1 day) with lock info.
 * from/to are ISO date strings (YYYY-MM-DD).
 * Uses UTC for comparisons.
 */
async function listSlotsWithLocks(from, to) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const fromDt = from + ' 00:00:00.000';
  const toStart = to + ' 00:00:00.000'; // [from, to+1 day) => start_at < (to+1) 00:00

  const [rows] = await pool.execute(
    `SELECT
      s.id,
      s.start_at,
      s.end_at,
      s.timezone,
      s.status,
      s.capacity,
      l.id AS lock_id,
      l.lock_token,
      l.expires_at AS lock_expires_at
    FROM slots s
    LEFT JOIN slot_locks l ON l.slot_id = s.id AND l.expires_at > NOW(3)
    WHERE s.start_at >= ? AND s.start_at < DATE_ADD(?, INTERVAL 1 DAY)
    ORDER BY s.start_at ASC`,
    [fromDt, toStart]
  );

  return rows;
}

async function getById(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT id, start_at, end_at, timezone, status, capacity FROM slots WHERE id = ?',
    [slotId]
  );
  return rows[0] ?? null;
}

module.exports = { listSlotsWithLocks, getById };
