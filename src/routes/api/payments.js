const express = require('express');
const Stripe = require('stripe');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const auditRepo = require('../../db/repositories/auditRepo');

const router = express.Router();

const DEPOSIT_CENTS_FIRST = 1000; // 10 €
const MIN_FULL_CENTS = 4500; // 45 €

function validateReservationId(raw) {
  const id = parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new ApiError('VALIDATION_ERROR', 'reservationId must be a positive integer', 400);
  }
  return id;
}

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

router.post(
  '/start',
  asyncHandler(async (req, res) => {
    const { reservationId: rawReservationId, paymentType: rawPaymentType, amount: rawAmount } = req.body ?? {};
    const reservationId = validateReservationId(rawReservationId);
    const paymentType = validatePaymentType(rawPaymentType);
    const amountCents = validateAmount(rawAmount, paymentType);

    const stripeSecret = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecret) {
      throw new ApiError('INTERNAL_ERROR', 'Stripe not configured', 503);
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const [resRows] = await pool.execute(
      'SELECT id, slot_id, user_id, email, status, payment_type FROM reservations WHERE id = ?',
      [reservationId]
    );
    const reservation = resRows[0];
    if (!reservation) {
      throw new ApiError('NOT_FOUND', 'Reservation not found', 404);
    }
    if (reservation.status !== 'pending_payment') {
      throw new ApiError('CONFLICT', 'Reservation is not pending payment', 409);
    }
    if (reservation.payment_type !== paymentType) {
      throw new ApiError('VALIDATION_ERROR', 'paymentType does not match reservation', 400);
    }

    const [existingPayment] = await pool.execute(
      'SELECT id FROM payments WHERE reservation_id = ? AND status = ? LIMIT 1',
      [reservationId, 'pending']
    );
    if (existingPayment.length > 0) {
      throw new ApiError('CONFLICT', 'Payment already in progress for this reservation', 409);
    }

    let cents;
    let paymentTypeForDb;
    if (paymentType === 'deposit') {
      cents = DEPOSIT_CENTS_FIRST;
      paymentTypeForDb = 'deposit';
    } else {
      cents = amountCents;
      paymentTypeForDb = 'session';
    }

    const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
    const successUrl = `${baseUrl}/funnels/pilot/?payment=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/funnels/pilot/?payment=cancelled`;

    const stripe = new Stripe(stripeSecret);
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
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
      customer_email: reservation.email,
      metadata: {
        reservationId: String(reservationId),
        userId: reservation.user_id ? String(reservation.user_id) : '',
        paymentType: paymentTypeForDb,
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    await pool.execute(
      `INSERT INTO payments (user_id, reservation_id, provider, provider_ref, payment_type, amount_cents, currency, status)
       VALUES (?, ?, 'stripe', ?, ?, ?, 'eur', 'pending')`,
      [reservation.user_id, reservationId, session.id, paymentTypeForDb, cents]
    );

    await auditRepo.log('payment_started', 'reservation', reservationId, {
      paymentType: paymentTypeForDb,
      amountCents: cents,
      sessionId: session.id,
    });

    res.status(200).json({ ok: true, url: session.url });
  })
);

module.exports = router;
