const { getPool } = require('../index');

async function getActiveLockForSlot(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT id, lock_token, expires_at FROM slot_locks WHERE slot_id = ? AND expires_at > NOW(3) LIMIT 1',
    [slotId]
  );
  return rows[0] ?? null;
}

async function createLock(slotId, lockToken, expiresAt, email = null) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  await pool.execute(
    'INSERT INTO slot_locks (slot_id, lock_token, email, expires_at) VALUES (?, ?, ?, ?)',
    [slotId, lockToken, email, expiresAt]
  );
}

/**
 * Find lock by slot_id and lock_token, only if not expired.
 */
async function findValidLock(slotId, lockToken) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    'SELECT id, slot_id, lock_token, expires_at FROM slot_locks WHERE slot_id = ? AND lock_token = ? AND expires_at > NOW(3) LIMIT 1',
    [slotId, lockToken]
  );
  return rows[0] ?? null;
}

async function deleteLock(slotId, lockToken) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [result] = await pool.execute(
    'DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?',
    [slotId, lockToken]
  );
  return result.affectedRows > 0;
}

module.exports = {
  getActiveLockForSlot,
  createLock,
  findValidLock,
  deleteLock,
};
