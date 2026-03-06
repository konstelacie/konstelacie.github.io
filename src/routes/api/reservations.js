const express = require('express');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { validateSlotId, validateEmail, validateLockToken } = require('../../middleware/validators');
const reservationsRepo = require('../../db/repositories/reservationsRepo');
const auditRepo = require('../../db/repositories/auditRepo');
const { getPool } = require('../../db');

const router = express.Router();

function validatePaymentChoice(rawPaymentType, rawAmount) {
  const paymentType = rawPaymentType === 'full' ? 'full' : 'deposit';
  if (paymentType === 'full') {
    const amount = parseInt(rawAmount, 10);
    if (!Number.isInteger(amount) || amount < 45) {
      throw new ApiError('VALIDATION_ERROR', 'amount must be at least 45 when paymentType is full', 400);
    }
    return { paymentType, amount };
  }
  return { paymentType, amount: null };
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { slotId: rawSlotId, lockToken: rawLockToken, email: rawEmail, paymentType: rawPaymentType, amount: rawAmount } = req.body ?? {};
    const slotId = validateSlotId(rawSlotId);
    const lockToken = validateLockToken(rawLockToken);
    const email = validateEmail(rawEmail, true);
    const { paymentType, amount } = validatePaymentChoice(rawPaymentType, rawAmount);

    const pool = getPool();
    if (!pool) throw new Error('Database not configured');
    const conn = await pool.getConnection();
    let reservationId;

    try {
      await conn.beginTransaction();

      const [slotRows] = await conn.execute(
        'SELECT id, status FROM slots WHERE id = ? FOR UPDATE',
        [slotId]
      );
      const slot = slotRows[0];
      if (!slot) {
        await conn.rollback();
        await auditRepo.log('reservation_failed', 'slot', slotId, { reason: 'slot_not_found' });
        throw new ApiError('NOT_FOUND', 'Slot not found', 404);
      }
      if (slot.status !== 'open') {
        await conn.rollback();
        await auditRepo.log('reservation_failed', 'slot', slotId, {
          reason: 'slot_not_open',
        });
        throw new ApiError('SLOT_NOT_OPEN', 'Slot is not open', 409);
      }

      const [lockRows] = await conn.execute(
        'SELECT id FROM slot_locks WHERE slot_id = ? AND lock_token = ? AND expires_at > NOW(3) LIMIT 1',
        [slotId, lockToken]
      );
      if (lockRows.length === 0) {
        await conn.rollback();
        await auditRepo.log('reservation_failed', 'slot', slotId, {
          reason: 'lock_not_found_or_expired',
        });
        throw new ApiError('LOCK_INVALID', 'Lock not found or expired', 404);
      }

      const [existingRes] = await conn.execute(
        "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('pending_payment','confirmed') LIMIT 1",
        [slotId]
      );
      if (existingRes.length > 0) {
        await conn.rollback();
        await auditRepo.log('reservation_failed', 'slot', slotId, {
          reason: 'slot_already_reserved',
        });
        throw new ApiError('SLOT_RESERVED', 'Slot already has an active reservation', 409);
      }

      let userId;
      const [userRows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (userRows.length > 0) {
        userId = userRows[0].id;
      } else {
        const [ins] = await conn.execute('INSERT INTO users (email) VALUES (?)', [email]);
        userId = ins.insertId;
      }

      const [insRes] = await conn.execute(
        'INSERT INTO reservations (slot_id, user_id, email, status, payment_type, lock_token) VALUES (?, ?, ?, \'pending_payment\', ?, ?)',
        [slotId, userId, email, paymentType, lockToken]
      );
      reservationId = insRes.insertId;

      // Strategy: delete lock after successful reservation (keeps slot_locks lean;
      // lock_token stored in reservation for traceability)
      await conn.execute(
        'DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?',
        [slotId, lockToken]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const reservation = await reservationsRepo.getById(reservationId);
    await auditRepo.log('reservation_created', 'reservation', reservationId, {
      slotId,
      email: email.slice(0, 3) + '...',
    });

    res.status(201).json({
      ok: true,
      reservation: {
        id: reservation.id,
        slotId: reservation.slot_id,
        email: reservation.email,
        status: reservation.status,
        createdAt: reservation.created_at.toISOString(),
      },
    });
  })
);

module.exports = router;
