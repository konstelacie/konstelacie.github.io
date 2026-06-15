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

/**
 * Hard-delete billing rows and payments (dev/admin cleanup). Clears billing_documents self-FKs first.
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {number[]} paymentIds
 * @param {number[]} [reservationIds]
 */
async function adminDeletePaymentsWithBilling(conn, paymentIds, reservationIds = []) {
  const payIds = [...new Set(paymentIds.filter((id) => Number.isInteger(id) && id > 0))];
  const resIds = [...new Set(reservationIds.filter((id) => Number.isInteger(id) && id > 0))];
  if (!payIds.length && !resIds.length) return;

  const docIdSet = new Set();
  if (payIds.length) {
    const ph = payIds.map(() => '?').join(',');
    const [byPay] = await conn.execute(
      `SELECT id FROM billing_documents WHERE payment_id IN (${ph})`,
      payIds
    );
    for (const row of byPay) docIdSet.add(row.id);
  }
  if (resIds.length) {
    const ph = resIds.map(() => '?').join(',');
    const [byRes] = await conn.execute(
      `SELECT id FROM billing_documents WHERE reservation_id IN (${ph})`,
      resIds
    );
    for (const row of byRes) docIdSet.add(row.id);
  }

  const docIds = [...docIdSet];
  if (docIds.length) {
    const dph = docIds.map(() => '?').join(',');
    await conn.execute(
      `UPDATE billing_documents SET advance_document_id = NULL WHERE advance_document_id IN (${dph})`,
      docIds
    );
    await conn.execute(
      `UPDATE billing_documents SET related_document_id = NULL WHERE related_document_id IN (${dph})`,
      docIds
    );
    await conn.execute(
      `DELETE FROM billing_document_lines WHERE billing_document_id IN (${dph})`,
      docIds
    );
    await conn.execute(`DELETE FROM billing_documents WHERE id IN (${dph})`, docIds);
  }

  if (payIds.length) {
    const ph = payIds.map(() => '?').join(',');
    await conn.execute(`DELETE FROM payments WHERE id IN (${ph})`, payIds);
  }
}

async function findByProviderRef(providerRef) {
  const pool = getPool();
  if (!pool) return null;

  const [rows] = await pool.execute(
    `SELECT id, provider, provider_ref, reservation_id, slot_id, payment_type, amount_cents, currency,
            status, paid_at, created_at
     FROM payments
     WHERE provider = 'stripe' AND provider_ref = ?
     LIMIT 1`,
    [providerRef]
  );
  return rows[0] || null;
}

/**
 * Completed booking payments for Stripe reconciliation (Case B).
 * payments.payment_type uses `session` for full upfront checkout (not `full` — that is reservations.payment_type).
 * @param {Date} since
 */
async function findCompletedBookingPaymentsSince(since) {
  const pool = getPool();
  if (!pool) return [];

  const [rows] = await pool.execute(
    `SELECT p.id, p.provider_ref, p.reservation_id, p.slot_id, p.payment_type, p.amount_cents,
            p.currency, p.status, p.paid_at, p.created_at,
            r.status AS reservation_status, r.email AS reservation_email
     FROM payments p
     LEFT JOIN reservations r ON r.id = p.reservation_id
     WHERE p.status = 'completed'
       AND p.provider = 'stripe'
       AND p.slot_id IS NOT NULL
       AND p.payment_type IN ('deposit', 'session')
       AND p.paid_at >= ?
     ORDER BY p.paid_at ASC`,
    [since]
  );
  return rows;
}

module.exports = {
  listByReservationId,
  hasPendingSlotPayment,
  reconcileExpiredStripeCheckouts,
  adminDeletePaymentsWithBilling,
  findByProviderRef,
  findCompletedBookingPaymentsSince,
};
