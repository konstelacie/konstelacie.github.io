const { getPool } = require('../index');
const { logLine } = require('../../lib/structuredLog');

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ eventName: string, eventId: string, paymentId?: number|null, status?: string, skipReason?: string|null }} params
 * @returns {Promise<{ inserted: boolean, id?: number }>}
 */
async function tryInsertCapiLog(pool, { eventName, eventId, paymentId = null, status = 'pending', skipReason = null }) {
  try {
    const [result] = await pool.execute(
      `INSERT INTO capi_send_log (event_name, event_id, payment_id, status, skip_reason)
       VALUES (?, ?, ?, ?, ?)`,
      [eventName, eventId, paymentId, status, skipReason]
    );
    return { inserted: true, id: result.insertId };
  } catch (err) {
    if (err && (err.code === 'ER_DUP_ENTRY' || err.errno === 1062)) {
      return { inserted: false };
    }
    throw err;
  }
}

/**
 * @param {number} id
 * @param {{ status: string, skipReason?: string|null, httpStatus?: number|null, metaResponse?: object|null, errorMessage?: string|null, sentAt?: boolean }} update
 */
async function updateCapiLogResult(id, update) {
  const pool = getPool();
  if (!pool) return;

  const sentAtClause = update.sentAt ? ', sent_at = NOW(3)' : '';
  await pool.execute(
    `UPDATE capi_send_log
     SET status = ?, skip_reason = ?, http_status = ?, meta_response = ?, error_message = ?${sentAtClause}
     WHERE id = ?`,
    [
      update.status,
      update.skipReason ?? null,
      update.httpStatus ?? null,
      update.metaResponse != null ? JSON.stringify(update.metaResponse) : null,
      update.errorMessage ?? null,
      id,
    ]
  );
}

/**
 * @param {number} id
 * @param {string} skipReason
 */
async function markCapiLogSkipped(id, skipReason) {
  await updateCapiLogResult(id, { status: 'skipped', skipReason, sentAt: false });
}

function logCapiError(tag, fields) {
  logLine({ level: 'error', tag, ...fields });
}

module.exports = {
  tryInsertCapiLog,
  updateCapiLogResult,
  markCapiLogSkipped,
  logCapiError,
};
