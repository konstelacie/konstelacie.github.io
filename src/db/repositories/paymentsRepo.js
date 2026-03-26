const { getPool } = require('../index');

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

module.exports = { listByReservationId };
