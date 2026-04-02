const { getPool } = require('../index');

/**
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {number} slotId
 * @param {string} token
 * @param {Date} expiresAt
 */
async function insertChallenge(executor, slotId, token, expiresAt) {
  await executor.execute(
    'INSERT INTO slot_lock_challenges (slot_id, challenge_token, expires_at) VALUES (?, ?, ?)',
    [slotId, token, expiresAt]
  );
}

/**
 * Mark challenge as used and verify it was valid for this slot (single-use).
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number} slotId
 * @param {string} token
 * @returns {Promise<boolean>}
 */
async function consumeChallengeIfValid(conn, slotId, token) {
  const [rows] = await conn.execute(
    `SELECT id FROM slot_lock_challenges
     WHERE slot_id = ? AND challenge_token = ? AND expires_at > NOW(3) AND used_at IS NULL
     FOR UPDATE`,
    [slotId, token]
  );
  const row = rows[0];
  if (!row) return false;
  const [upd] = await conn.execute(
    'UPDATE slot_lock_challenges SET used_at = NOW(3) WHERE id = ? AND used_at IS NULL',
    [row.id]
  );
  return upd.affectedRows > 0;
}

/** Best-effort cleanup of expired rows (called from lock-challenge GET). */
async function deleteExpiredBatch(executor, limit = 2000) {
  const cap = Math.min(10000, Math.max(1, Number(limit) || 2000));
  await executor.query(`DELETE FROM slot_lock_challenges WHERE expires_at < NOW(3) LIMIT ${cap}`);
}

module.exports = {
  insertChallenge,
  consumeChallengeIfValid,
  deleteExpiredBatch,
};
