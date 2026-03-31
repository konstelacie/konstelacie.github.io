const { getPool } = require('../index');

/**
 * Mark funnel Stripe checkouts whose session window has passed as expired and purge expired slot_lock rows.
 * Runs on read/write paths instead of cron. Safe with checkout.session.expired (idempotent).
 * @param {import('mysql2/promise').Pool | import('mysql2/promise').PoolConnection} executor
 * @param {{ slotId?: number }} [opts]
 */
async function reconcileExpiredStripeCheckouts(executor, opts = {}) {
  const slotId = opts.slotId;
  let sql = `UPDATE payments SET status = 'expired'
     WHERE status = 'pending' AND provider = 'stripe'
     AND slot_id IS NOT NULL
     AND checkout_expires_at <= NOW(3)`;
  const params = [];
  if (slotId != null) {
    sql += ' AND slot_id = ?';
    params.push(slotId);
  }
  await executor.execute(sql, params);
  await executor.execute('DELETE FROM slot_locks WHERE expires_at < NOW(3)');
}

async function listByReservationId(reservationId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT id, provider, provider_ref, payment_type, amount_cents, currency, status, paid_at, created_at, updated_at
     FROM payments WHERE reservation_id = ?
     ORDER BY created_at ASC, id ASC`,
    [reservationId]
  );
  return rows;
}

async function hasPendingSlotPayment(slotId) {
  const pool = getPool();
  if (!pool) throw new Error('Database not configured');

  const [rows] = await pool.execute(
    `SELECT id FROM payments WHERE slot_id = ? AND status = 'pending' AND provider = 'stripe'
     AND checkout_expires_at > NOW(3) LIMIT 1`,
    [slotId]
  );
  return rows.length > 0;
}

module.exports = {
  listByReservationId,
  hasPendingSlotPayment,
  reconcileExpiredStripeCheckouts,
};
