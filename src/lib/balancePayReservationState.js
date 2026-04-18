/**
 * Shared DB state for optional balance (doplatok) payment (see docs/SESSION-PRICING.md).
 * Used by public API and admin UI.
 */

/**
 * @param {import('mysql2/promise').Pool} pool
 * @param {number} reservationId
 * @returns {Promise<
 *   | { kind: 'missing' }
 *   | { kind: 'ok'; resv: object; paidCents: number; topupAlreadyCompleted: boolean; topupPending: boolean }
 * >}
 */
async function loadBalanceReservationState(pool, reservationId) {
  const [resRows] = await pool.execute(
    `SELECT r.id, r.status, r.email, r.user_id, r.slot_id,
            s.local_date, s.grid_index, s.start_at_utc, s.end_at_utc, s.timezone
     FROM reservations r
     INNER JOIN slots s ON s.id = r.slot_id
     WHERE r.id = ?
     LIMIT 1`,
    [reservationId]
  );
  const resv = resRows[0];
  if (!resv) {
    return { kind: 'missing' };
  }

  const [sumRows] = await pool.execute(
    `SELECT COALESCE(SUM(amount_cents), 0) AS paid_cents
     FROM payments
     WHERE reservation_id = ? AND status = 'completed'`,
    [reservationId]
  );
  const paidCents = Number(sumRows[0]?.paid_cents ?? 0) || 0;

  const [topDone] = await pool.execute(
    `SELECT id FROM payments
     WHERE reservation_id = ? AND payment_type = 'topup' AND status = 'completed'
     LIMIT 1`,
    [reservationId]
  );
  const topupAlreadyCompleted = topDone.length > 0;

  const [topPending] = await pool.execute(
    `SELECT id FROM payments
     WHERE reservation_id = ? AND payment_type = 'topup' AND status = 'pending'
       AND checkout_expires_at > NOW(3)
     LIMIT 1`,
    [reservationId]
  );
  const topupPending = topPending.length > 0;

  return {
    kind: 'ok',
    resv,
    paidCents,
    topupAlreadyCompleted,
    topupPending,
  };
}

module.exports = { loadBalanceReservationState };
