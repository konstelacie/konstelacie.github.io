const express = require('express');
const crypto = require('crypto');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { validateSlotId, validateDateRange, validateEmail, validateLockToken } = require('../../middleware/validators');
const slotsRepo = require('../../db/repositories/slotsRepo');
const locksRepo = require('../../db/repositories/locksRepo');
const auditRepo = require('../../db/repositories/auditRepo');
const { getPool } = require('../../db');
const { slotPassesBookingWindow } = require('../../lib/slotBookingRules');
const { mapSlotRowToApi, gridMetadata } = require('../../lib/slotApiMap');

const router = express.Router();
/** Hold window while the user enters email (no full payment countdown yet). */
const LOCK_HOLD_BEFORE_EMAIL_MS = 5 * 60 * 1000;
/** Hold window after email is submitted, until payment completes. */
const LOCK_HOLD_AFTER_EMAIL_MS = 15 * 60 * 1000;

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { from, to, lockToken: clientLockToken } = req.query;
    const { from: f, to: t } = validateDateRange(from, to);

    const rows = await slotsRepo.listSlotsWithLocks(f, t);

    const clientToken = typeof clientLockToken === 'string' ? clientLockToken.trim() : null;
    const slots = rows.map((r) => {
      const hasLock = r.lock_id != null;
      const rowToken = r.lock_token != null ? String(r.lock_token).trim() : null;
      const isMyLock = hasLock && clientToken && rowToken && rowToken === clientToken;
      return mapSlotRowToApi(r, {
        isLocked: hasLock,
        isMyLock: !!isMyLock,
        lockExpiresAt: hasLock && r.lock_expires_at ? r.lock_expires_at.toISOString() : null,
      });
    });

    res.json({
      ok: true,
      range: { from: f, to: t },
      grid: gridMetadata(),
      slots,
    });
  })
);

router.post(
  '/:slotId/lock',
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const email = validateEmail(req.body?.email ?? null, false);

    const slot = await slotsRepo.getById(slotId);
    if (!slot) {
      await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'slot_not_found' });
      throw new ApiError('NOT_FOUND', 'Slot not found', 404);
    }
    if (slot.status !== 'open') {
      await auditRepo.log('lock_failed', 'slot', slotId, {
        reason: 'slot_not_open',
        status: slot.status,
      });
      throw new ApiError('SLOT_NOT_OPEN', 'Slot is not open for booking', 409);
    }

    if (!slotPassesBookingWindow(slot)) {
      await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'outside_booking_window' });
      throw new ApiError('SLOT_NOT_OPEN', 'Slot is not open for booking', 409);
    }

    const existingLock = await locksRepo.getActiveLockForSlot(slotId);
    if (existingLock) {
      const expiresAt =
        existingLock.expires_at instanceof Date
          ? existingLock.expires_at
          : new Date(existingLock.expires_at);
      const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'already_locked' });
      throw new ApiError('SLOT_LOCKED', 'Slot is already locked', 409, {
        retryAfterSeconds: remaining,
      });
    }

    const lockToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + LOCK_HOLD_BEFORE_EMAIL_MS);

    const pool = getPool();
    if (!pool) throw new Error('Database not configured');
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const [recheck] = await conn.execute(
        'SELECT id, expires_at FROM slot_locks WHERE slot_id = ? AND expires_at > NOW(3) LIMIT 1',
        [slotId]
      );
      if (recheck.length > 0) {
        const exp = recheck[0].expires_at;
        const expDate = exp instanceof Date ? exp : new Date(exp);
        const remaining = Math.max(0, Math.ceil((expDate - Date.now()) / 1000));
        await conn.rollback();
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'already_locked_race' });
        throw new ApiError('SLOT_LOCKED', 'Slot is already locked', 409, {
          retryAfterSeconds: remaining,
        });
      }

      await conn.execute(
        'INSERT INTO slot_locks (slot_id, lock_token, email, expires_at) VALUES (?, ?, ?, ?)',
        [slotId, lockToken, email, expiresAt]
      );
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    await auditRepo.log('lock_created', 'slot', slotId, {
      lockToken: lockToken.slice(0, 8) + '...',
    });

    res.json({
      ok: true,
      slotId,
      lockToken,
      expiresAt: expiresAt.toISOString(),
    });
  })
);

router.post(
  '/:slotId/extend-lock',
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const lockToken = validateLockToken(req.body?.lockToken);
    const email = validateEmail(req.body?.email, true);

    const expiresAt = new Date(Date.now() + LOCK_HOLD_AFTER_EMAIL_MS);
    const updated = await locksRepo.extendLockExpiration(slotId, lockToken, email, expiresAt);
    if (!updated) {
      await auditRepo.log('lock_extend_failed', 'slot', slotId, { reason: 'not_found_or_expired' });
      throw new ApiError('LOCK_INVALID', 'Lock not found or expired', 404);
    }

    await auditRepo.log('lock_extended', 'slot', slotId, {
      lockToken: lockToken.slice(0, 8) + '...',
    });

    res.json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
    });
  })
);

module.exports = router;
