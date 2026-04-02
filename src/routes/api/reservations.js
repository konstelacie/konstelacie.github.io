const express = require('express');
const { reservationStatusLimiter } = require('../../middleware/rateLimits');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const { timeKeyForGridIndex } = require('../../config/slotGrid');
const { mysqlLocalDateToYmd } = require('../../lib/slotApiMap');

const router = express.Router();

function validateReservationId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'Reservation ID must be a positive integer', 400);
  }
  return id;
}

router.get(
  '/:id/status',
  reservationStatusLimiter,
  asyncHandler(async (req, res) => {
    const id = validateReservationId(req.params.id);
    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const [rows] = await pool.execute(
      `SELECT r.id, r.slot_id, r.status AS reservation_status,
              s.local_date, s.grid_index, s.start_at_utc, s.end_at_utc, s.timezone
       FROM reservations r
       JOIN slots s ON s.id = r.slot_id
       WHERE r.id = ?`,
      [id]
    );
    const row = rows[0];
    if (!row) {
      throw new ApiError('NOT_FOUND', 'Reservation not found', 404);
    }

    const [paymentRows] = await pool.execute(
      'SELECT status FROM payments WHERE reservation_id = ? ORDER BY created_at DESC LIMIT 1',
      [id]
    );
    const paymentStatus = paymentRows[0]?.status ?? null;

    const gridIndex = Number(row.grid_index);
    res.json({
      ok: true,
      id: row.id,
      status: row.reservation_status,
      slotId: row.slot_id,
      localDate: mysqlLocalDateToYmd(row.local_date),
      gridIndex,
      timeKey: timeKeyForGridIndex(gridIndex),
      startsAt: row.start_at_utc.toISOString(),
      endsAt: row.end_at_utc.toISOString(),
      timezone: row.timezone,
      paymentStatus: paymentStatus,
      paymentUrl: null,
    });
  })
);

module.exports = router;
