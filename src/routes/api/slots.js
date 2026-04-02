const express = require('express');
const crypto = require('crypto');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const {
  validateSlotId,
  validateDateRange,
  validateEmail,
  validateLockToken,
  validateChallengeToken,
} = require('../../middleware/validators');
const slotsRepo = require('../../db/repositories/slotsRepo');
const locksRepo = require('../../db/repositories/locksRepo');
const lockChallengesRepo = require('../../db/repositories/lockChallengesRepo');
const reservationsRepo = require('../../db/repositories/reservationsRepo');
const paymentsRepo = require('../../db/repositories/paymentsRepo');
const auditRepo = require('../../db/repositories/auditRepo');
const { getPool } = require('../../db');
const { slotPassesBookingWindow } = require('../../lib/slotBookingRules');
const { mapSlotRowToApi, gridMetadata } = require('../../lib/slotApiMap');
const { ensureEmailAvailableForBooking } = require('../../lib/bookingEmailAvailability');
const { bookingCannotCompleteError } = require('../../lib/bookingApiMessages');
const { handleCaptchaGate, ROUTE_LOCK } = require('../../lib/captcha');
const {
  slotsListLimiter,
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  lockChallengeGetLimiter,
} = require('../../middleware/rateLimits');

const router = express.Router();
/** Hold window while the user enters email (no full payment countdown yet). */
const LOCK_HOLD_BEFORE_EMAIL_MS = 5 * 60 * 1000;
/** Lock challenge TTL (docs/security/booking.md: 1–3 min). */
const LOCK_CHALLENGE_TTL_MS = 2 * 60 * 1000;
/** Hold window after email is submitted, until payment completes. */
const LOCK_HOLD_AFTER_EMAIL_MS = 15 * 60 * 1000;

router.get(
  '/',
  slotsListLimiter,
  asyncHandler(async (req, res) => {
    const { from, to, lockToken: clientLockToken, stripeSessionId: rawStripeSessionId } = req.query;
    const { from: f, to: t } = validateDateRange(from, to);

    const rows = await slotsRepo.listSlotsWithLocks(f, t);

    let checkoutSessionId =
      typeof rawStripeSessionId === 'string' ? rawStripeSessionId.trim() : '';
    if (checkoutSessionId && !checkoutSessionId.startsWith('cs_')) {
      checkoutSessionId = '';
    }

    const clientToken = typeof clientLockToken === 'string' ? clientLockToken.trim() : null;
    const slots = rows.map((r) => {
      const hasLock = r.lock_id != null;
      const rowToken = r.lock_token != null ? String(r.lock_token).trim() : null;
      const isMyLockByToken = !!(hasLock && clientToken && rowToken && rowToken === clientToken);
      const pendingRef =
        r.pending_checkout_provider_ref != null ? String(r.pending_checkout_provider_ref).trim() : '';
      const isMyLockByCheckout =
        !!checkoutSessionId && !!pendingRef && pendingRef === checkoutSessionId;
      const isMyLock = isMyLockByToken || isMyLockByCheckout;
      return mapSlotRowToApi(r, {
        isMyLock,
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

/**
 * Capability pre-step for POST /slots/:slotId/lock (see docs/security/booking.md Phase 2).
 */
router.get(
  '/:slotId/lock-challenge',
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  lockChallengeGetLimiter,
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    await lockChallengesRepo.deleteExpiredBatch(pool);

    const slot = await slotsRepo.getById(slotId);
    if (!slot) {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, { reason: 'slot_not_found' });
      throw bookingCannotCompleteError(409);
    }
    if (slot.status !== 'open') {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, {
        reason: 'slot_not_open',
        status: slot.status,
      });
      throw bookingCannotCompleteError(409);
    }
    if (!slotPassesBookingWindow(slot)) {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, { reason: 'outside_booking_window' });
      throw bookingCannotCompleteError(409);
    }
    if (await reservationsRepo.hasActiveReservationForSlot(slotId)) {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, { reason: 'slot_already_reserved' });
      throw bookingCannotCompleteError(409);
    }

    await paymentsRepo.reconcileExpiredStripeCheckouts(pool, { slotId });
    if (await paymentsRepo.hasPendingSlotPayment(slotId)) {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, { reason: 'checkout_pending' });
      throw bookingCannotCompleteError(409);
    }
    if (await locksRepo.getActiveLockForSlot(slotId)) {
      await auditRepo.log('lock_challenge_failed', 'slot', slotId, { reason: 'already_locked' });
      throw bookingCannotCompleteError(409);
    }

    const challengeExpiresAt = new Date(Date.now() + LOCK_CHALLENGE_TTL_MS);
    const challengeToken = crypto.randomBytes(32).toString('base64url');
    await lockChallengesRepo.insertChallenge(pool, slotId, challengeToken, challengeExpiresAt);

    res.json({
      ok: true,
      challengeToken,
      challengeExpiresAt: challengeExpiresAt.toISOString(),
    });
  })
);

router.post(
  '/:slotId/lock',
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const email = validateEmail(req.body?.email ?? null, false);
    const challengeToken = validateChallengeToken(req.body?.challengeToken);

    const captchaGate = await handleCaptchaGate(req, res, { route: ROUTE_LOCK, slotId });
    if (!captchaGate.proceed) {
      return res.status(captchaGate.status).json(captchaGate.body);
    }

    const pool = getPool();
    if (!pool) throw new Error('Database not configured');

    await paymentsRepo.reconcileExpiredStripeCheckouts(pool, { slotId });

    const lockToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + LOCK_HOLD_BEFORE_EMAIL_MS);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await paymentsRepo.reconcileExpiredStripeCheckouts(conn, { slotId });

      const [slotRows] = await conn.execute('SELECT id, status, start_at_utc FROM slots WHERE id = ? FOR UPDATE', [
        slotId,
      ]);
      const slot = slotRows[0];
      if (!slot) {
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'slot_not_found' });
        throw bookingCannotCompleteError(409);
      }
      if (slot.status !== 'open') {
        await auditRepo.log('lock_failed', 'slot', slotId, {
          reason: 'slot_not_open',
          status: slot.status,
        });
        throw bookingCannotCompleteError(409);
      }
      if (!slotPassesBookingWindow(slot)) {
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'outside_booking_window' });
        throw bookingCannotCompleteError(409);
      }

      const [existingRes] = await conn.execute(
        "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('pending_payment','confirmed') LIMIT 1",
        [slotId]
      );
      if (existingRes.length > 0) {
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'slot_already_reserved' });
        throw bookingCannotCompleteError(409);
      }

      const [pendingPay] = await conn.execute(
        `SELECT id FROM payments WHERE slot_id = ? AND status = 'pending' AND provider = 'stripe'
         AND checkout_expires_at > NOW(3) LIMIT 1`,
        [slotId]
      );
      if (pendingPay.length > 0) {
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'checkout_pending' });
        throw bookingCannotCompleteError(409);
      }

      const [lockRows] = await conn.execute(
        'SELECT id, expires_at FROM slot_locks WHERE slot_id = ? AND expires_at > NOW(3) LIMIT 1 FOR UPDATE',
        [slotId]
      );
      if (lockRows.length > 0) {
        const exp = lockRows[0].expires_at;
        const expDate = exp instanceof Date ? exp : new Date(exp);
        const remaining = Math.max(0, Math.ceil((expDate - Date.now()) / 1000));
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'already_locked' });
        throw new ApiError('SLOT_LOCKED', 'Slot is already locked', 409, {
          retryAfterSeconds: remaining,
        });
      }

      if (email) {
        await ensureEmailAvailableForBooking(email);
      }

      const consumed = await lockChallengesRepo.consumeChallengeIfValid(conn, slotId, challengeToken);
      if (!consumed) {
        await auditRepo.log('lock_failed', 'slot', slotId, { reason: 'challenge_invalid' });
        throw bookingCannotCompleteError(409);
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
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const lockToken = validateLockToken(req.body?.lockToken);
    const email = validateEmail(req.body?.email, true);

    await ensureEmailAvailableForBooking(email, { exceptSlotId: slotId, exceptLockToken: lockToken });

    const expiresAt = new Date(Date.now() + LOCK_HOLD_AFTER_EMAIL_MS);
    const updated = await locksRepo.extendLockExpiration(slotId, lockToken, email, expiresAt);
    if (!updated) {
      await auditRepo.log('lock_extend_failed', 'slot', slotId, { reason: 'not_found_or_expired' });
      throw bookingCannotCompleteError(409);
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

/** "Upraviť e-mail" — trim hold to the same window as first email step (5 min). */
router.post(
  '/:slotId/lock-for-email-edit',
  bookingWriteLimiter,
  slotPostBySlotLimiter,
  asyncHandler(async (req, res) => {
    const slotId = validateSlotId(req.params.slotId);
    const lockToken = validateLockToken(req.body?.lockToken);

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    await paymentsRepo.reconcileExpiredStripeCheckouts(pool, { slotId });

    const [rows] = await pool.execute(
      'SELECT email FROM slot_locks WHERE slot_id = ? AND lock_token = ? AND expires_at > NOW(3) LIMIT 1',
      [slotId, lockToken]
    );
    if (rows.length === 0) {
      await auditRepo.log('lock_extend_failed', 'slot', slotId, { reason: 'not_found_or_expired', context: 'email_edit' });
      throw bookingCannotCompleteError(409);
    }

    const expiresAt = new Date(Date.now() + LOCK_HOLD_BEFORE_EMAIL_MS);
    const updated = await locksRepo.extendLockExpiration(slotId, lockToken, rows[0].email, expiresAt);
    if (!updated) {
      await auditRepo.log('lock_extend_failed', 'slot', slotId, { reason: 'not_found_or_expired', context: 'email_edit' });
      throw bookingCannotCompleteError(409);
    }

    await auditRepo.log('lock_extended', 'slot', slotId, {
      lockToken: lockToken.slice(0, 8) + '...',
      reason: 'email_edit',
    });

    res.json({
      ok: true,
      expiresAt: expiresAt.toISOString(),
    });
  })
);

module.exports = router;
