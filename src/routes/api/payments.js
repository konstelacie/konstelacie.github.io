const express = require('express');
const Stripe = require('stripe');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const auditRepo = require('../../db/repositories/auditRepo');
const locksRepo = require('../../db/repositories/locksRepo');
const { FUNNEL_INSTANCES, parseFunnelAttribution } = require('../funnels');
const { timeKeyForGridIndex } = require('../../config/slotGrid');
const { mysqlLocalDateToYmd } = require('../../lib/slotApiMap');
const { validateSlotId, validateEmail, validateLockToken } = require('../../middleware/validators');
const { slotPassesBookingWindow } = require('../../lib/slotBookingRules');
const { checkoutExpiresAtFromNow } = require('../../config/checkoutHold');
const paymentsRepo = require('../../db/repositories/paymentsRepo');

const router = express.Router();

const DEPOSIT_CENTS_FIRST = 1000; // 10 €
const MIN_FULL_CENTS = 4500; // 45 €

function validatePaymentType(raw) {
  if (raw === 'deposit' || raw === 'full') return raw;
  throw new ApiError('VALIDATION_ERROR', 'paymentType must be deposit or full', 400);
}

function validateAmount(raw, paymentType) {
  if (paymentType === 'deposit') return null;
  const amount = parseInt(raw, 10);
  if (!Number.isInteger(amount) || amount < 45) {
    throw new ApiError('VALIDATION_ERROR', 'amount must be at least 45 when paymentType is full', 400);
  }
  return amount * 100; // euros → cents
}

function validateReturnPath(raw) {
  const path = typeof raw === 'string' ? raw.replace(/\/$/, '').replace(/^\//, '') : '';
  const name = path || 'pilot';
  if (!FUNNEL_INSTANCES.includes(name)) {
    return 'pilot';
  }
  return name;
}

router.get(
  '/status',
  asyncHandler(async (req, res) => {
    const sessionId = req.query.session_id;
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.startsWith('cs_')) {
      return res.status(400).json({ ok: false, error: 'Valid session_id (Stripe Checkout Session ID) required' });
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const [paymentRows] = await pool.execute(
      `SELECT p.id, p.reservation_id, p.status AS payment_status, p.amount_cents, p.paid_at
       FROM payments p
       WHERE p.provider_ref = ? LIMIT 1`,
      [sessionId]
    );
    const payment = paymentRows[0];
    if (!payment) {
      return res.status(404).json({ ok: false, error: 'Payment not found' });
    }

    let reservation = null;
    let slot = null;
    if (payment.reservation_id) {
      const [resRows] = await pool.execute(
        `SELECT r.id, r.status AS reservation_status, r.slot_id
         FROM reservations r WHERE r.id = ?`,
        [payment.reservation_id]
      );
      reservation = resRows[0];
      if (reservation) {
        const [slotRows] = await pool.execute(
          'SELECT local_date, grid_index, start_at_utc, end_at_utc, timezone FROM slots WHERE id = ?',
          [reservation.slot_id]
        );
        slot = slotRows[0];
      }
    }

    res.json({
      ok: true,
      payment: {
        status: payment.payment_status,
        amountCents: payment.amount_cents,
        paidAt: payment.paid_at ? payment.paid_at.toISOString() : null,
      },
      reservation: reservation
        ? {
            id: reservation.id,
            status: reservation.reservation_status,
            slotId: reservation.slot_id,
          }
        : null,
      slot: slot
        ? {
            localDate: mysqlLocalDateToYmd(slot.local_date),
            gridIndex: Number(slot.grid_index),
            timeKey: timeKeyForGridIndex(Number(slot.grid_index)),
            startAt: slot.start_at_utc.toISOString(),
            endAt: slot.end_at_utc.toISOString(),
            timezone: slot.timezone,
          }
        : null,
    });
  })
);

router.post(
  '/start',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const slotId = validateSlotId(body.slotId);
    const lockToken = validateLockToken(body.lockToken);
    const email = validateEmail(body.email, true);
    const paymentType = validatePaymentType(body.paymentType);
    const amountCents = validateAmount(body.amount, paymentType);
    const funnel = parseFunnelAttribution(body);

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      throw new ApiError('INTERNAL_ERROR', 'Stripe not configured', 503);
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    let cents;
    let paymentTypeForDb;
    if (paymentType === 'deposit') {
      cents = DEPOSIT_CENTS_FIRST;
      paymentTypeForDb = 'deposit';
    } else {
      cents = amountCents;
      paymentTypeForDb = 'session';
    }

    const funnelName = validateReturnPath(body.returnPath);
    const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
    const successUrl = `${baseUrl}/${funnelName}/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/${funnelName}/cancel`;

    const checkoutExpiresAt = checkoutExpiresAtFromNow();
    const checkoutExpiresUnix = Math.floor(checkoutExpiresAt.getTime() / 1000);

    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      expires_at: checkoutExpiresUnix,
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: paymentType === 'deposit' ? 'Rezervačný poplatok' : 'Sedenie – plná platba',
              description: paymentType === 'deposit' ? 'Rezervácia termínu' : 'Platba za sedenie',
            },
            unit_amount: cents,
          },
          quantity: 1,
        },
      ],
      customer_email: email,
      metadata: {
        slotId: String(slotId),
        lockToken,
        paymentType: paymentTypeForDb,
        funnelName: funnel.funnelName ? String(funnel.funnelName) : '',
        funnelCampaign: funnel.funnelCampaign ? String(funnel.funnelCampaign) : '',
        funnelVideoId: funnel.funnelVideoId ? String(funnel.funnelVideoId) : '',
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    const conn = await pool.getConnection();
    let userId;
    try {
      await conn.beginTransaction();

      await paymentsRepo.reconcileExpiredStripeCheckouts(conn, { slotId });

      const [slotRows] = await conn.execute('SELECT id, status, start_at_utc FROM slots WHERE id = ? FOR UPDATE', [
        slotId,
      ]);
      const slot = slotRows[0];
      if (!slot) {
        throw new ApiError('NOT_FOUND', 'Slot not found', 404);
      }
      if (slot.status !== 'open') {
        throw new ApiError('SLOT_NOT_OPEN', 'Slot is not open', 409);
      }
      if (!slotPassesBookingWindow(slot)) {
        throw new ApiError('SLOT_NOT_OPEN', 'Slot is not open for booking', 409);
      }

      const [existingRes] = await conn.execute(
        "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('pending_payment','confirmed') LIMIT 1",
        [slotId]
      );
      if (existingRes.length > 0) {
        throw new ApiError('SLOT_RESERVED', 'Slot already has an active reservation', 409);
      }

      const [pendingPay] = await conn.execute(
        `SELECT id FROM payments WHERE slot_id = ? AND status = 'pending' AND provider = 'stripe'
         AND checkout_expires_at > NOW(3) LIMIT 1`,
        [slotId]
      );
      if (pendingPay.length > 0) {
        throw new ApiError('CONFLICT', 'Payment already in progress for this slot', 409);
      }

      const held = await locksRepo.setLockCheckoutHoldConn(conn, slotId, lockToken, email, checkoutExpiresAt);
      if (!held) {
        throw new ApiError('LOCK_INVALID', 'Lock not found', 404);
      }

      const [userRows] = await conn.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (userRows.length > 0) {
        userId = userRows[0].id;
      } else {
        const [ins] = await conn.execute('INSERT INTO users (email) VALUES (?)', [email]);
        userId = ins.insertId;
      }

      await conn.execute(
        `INSERT INTO payments (user_id, reservation_id, slot_id, provider, provider_ref, payment_type, amount_cents, currency, status, checkout_expires_at)
         VALUES (?, NULL, ?, 'stripe', ?, ?, ?, 'eur', 'pending', ?)`,
        [userId, slotId, session.id, paymentTypeForDb, cents, checkoutExpiresAt]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        console.error('[payments/start] Stripe expire after DB failure', session.id, expireErr);
      }
      throw e;
    } finally {
      conn.release();
    }

    await auditRepo.log('payment_started', 'slot', slotId, {
      paymentType: paymentTypeForDb,
      amountCents: cents,
      sessionId: session.id,
      funnelName: funnel.funnelName,
      funnelCampaign: funnel.funnelCampaign,
      funnelVideoId: funnel.funnelVideoId,
    });

    res.status(200).json({
      ok: true,
      url: session.url,
      checkoutSessionId: session.id,
      lockExpiresAt: checkoutExpiresAt.toISOString(),
    });
  })
);

module.exports = router;
