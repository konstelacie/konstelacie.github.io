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

  const token = typeof lockToken === 'string' ? lockToken.trim() : String(lockToken || '').trim();
  const [result] = await pool.execute(
    'DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?',
    [Number(slotId), token]
  );
  return result.affectedRows > 0;
}

/**
 * Extend an active lock and set email (e.g. after user submits email — longer hold window).
 * @returns {boolean} true if a row was updated
 */
async function extendLockExpiration(slotId, lockToken, email, expiresAt) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const token = typeof lockToken === 'string' ? lockToken.trim() : String(lockToken || '').trim();
  const [result] = await pool.execute(
    'UPDATE slot_locks SET expires_at = ?, email = ? WHERE slot_id = ? AND lock_token = ? AND expires_at > NOW(3)',
    [expiresAt, email, Number(slotId), token]
  );
  return result.affectedRows > 0;
}

/**
 * Extend/revive a lock for Stripe checkout (no expires_at guard). Used after Checkout Session is created.
 * @param {import('mysql2/promise').PoolConnection} conn
 */
async function setLockCheckoutHoldConn(conn, slotId, lockToken, email, expiresAt) {
  const token = typeof lockToken === 'string' ? lockToken.trim() : String(lockToken || '').trim();
  const [result] = await conn.execute(
    'UPDATE slot_locks SET expires_at = ?, email = ? WHERE slot_id = ? AND lock_token = ?',
    [expiresAt, email, Number(slotId), token]
  );
  return result.affectedRows > 0;
}

/** Max rows removed per admin maintenance action (bounded DELETE). */
const EXPIRED_LOCK_PURGE_BATCH_MAX = 5000;

async function getSlotLocksMaintenanceStats() {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [[totals]] = await pool.query(
    `SELECT
       (SELECT COUNT(*) FROM slot_locks) AS total,
       (SELECT COUNT(*) FROM slot_locks WHERE expires_at < NOW(3)) AS expired`
  );
  const [oldestRows] = await pool.execute(
    'SELECT MIN(expires_at) AS oldest_expires_at FROM slot_locks WHERE expires_at < NOW(3)'
  );

  return {
    total: Number(totals.total),
    expired: Number(totals.expired),
    active: Number(totals.total) - Number(totals.expired),
    oldestExpiredAt: oldestRows[0]?.oldest_expires_at ?? null,
  };
}

/**
 * Sample expired locks for admin preview (no email / token).
 * @param {number} limit capped at 50
 */
async function listExpiredSlotLocksPreview(limit = 5) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const cap = Math.min(50, Math.max(1, parseInt(String(limit), 10) || 5));
  const [rows] = await pool.query(
    `SELECT id, slot_id, expires_at FROM slot_locks WHERE expires_at < NOW(3) ORDER BY expires_at ASC LIMIT ${cap}`
  );
  return rows;
}

/**
 * Delete up to `batchSize` expired lock rows (hygiene; availability already ignores expired rows).
 * @returns {number} affected rows
 */
async function deleteExpiredSlotLocksBatch(batchSize) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');
  const cap = Math.min(EXPIRED_LOCK_PURGE_BATCH_MAX, Math.max(1, parseInt(String(batchSize), 10) || EXPIRED_LOCK_PURGE_BATCH_MAX));
  const [result] = await pool.query(`DELETE FROM slot_locks WHERE expires_at < NOW(3) LIMIT ${cap}`);
  return result.affectedRows;
}

module.exports = {
  getActiveLockForSlot,
  createLock,
  findValidLock,
  deleteLock,
  extendLockExpiration,
  setLockCheckoutHoldConn,
  EXPIRED_LOCK_PURGE_BATCH_MAX,
  getSlotLocksMaintenanceStats,
  listExpiredSlotLocksPreview,
  deleteExpiredSlotLocksBatch,
};
