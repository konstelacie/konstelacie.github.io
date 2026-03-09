const express = require('express');
const Stripe = require('stripe');
const { asyncHandler } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const auditRepo = require('../../db/repositories/auditRepo');
const emailService = require('../../services/emailService');

const router = express.Router();

async function sendConfirmationEmailAsync(paymentId, reservationId) {
  const pool = getPool();
  if (!pool) return;

  const [rows] = await pool.execute(
    `SELECT r.email, s.start_at, s.end_at, s.timezone, p.amount_cents, p.currency
     FROM reservations r
     JOIN slots s ON r.slot_id = s.id
     JOIN payments p ON p.reservation_id = r.id
     WHERE r.id = ? AND p.id = ? LIMIT 1`,
    [reservationId, paymentId]
  );
  const row = rows[0];
  if (!row) return;

  await emailService.sendReservationConfirmation(
    {
      to: row.email,
      slot: { start_at: row.start_at, end_at: row.end_at, timezone: row.timezone },
      amountCents: row.amount_cents,
      currency: row.currency,
    },
    { entity_type: 'reservation', entity_id: reservationId }
  );
}

async function isEventAlreadyProcessed(pool, eventId) {
  const [rows] = await pool.execute(
    'SELECT id FROM webhook_events WHERE stripe_event_id = ? LIMIT 1',
    [eventId]
  );
  return rows.length > 0;
}

async function recordProcessedEvent(pool, eventId) {
  await pool.execute(
    'INSERT INTO webhook_events (stripe_event_id) VALUES (?)',
    [eventId]
  );
}

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      return res.status(400).json({ ok: false, error: 'Missing signature or webhook secret' });
    }

    let event;
    try {
      event = Stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: 'Database not configured' });
    }

    if (await isEventAlreadyProcessed(pool, event.id)) {
      return res.status(200).json({ received: true });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [paymentRows] = await conn.execute(
            'SELECT id, reservation_id FROM payments WHERE provider_ref = ? AND status = ? LIMIT 1',
            [session.id, 'pending']
          );
          const payment = paymentRows[0];
          if (!payment) {
            await conn.rollback();
            console.warn('[Stripe webhook] checkout.session.completed: no pending payment for', session.id);
            break;
          }

          await conn.execute(
            'UPDATE payments SET status = ?, paid_at = NOW(3) WHERE id = ?',
            ['completed', payment.id]
          );

          if (payment.reservation_id) {
            await conn.execute(
              'UPDATE reservations SET status = ? WHERE id = ?',
              ['confirmed', payment.reservation_id]
            );
          }

          await conn.execute(
            'INSERT INTO webhook_events (stripe_event_id) VALUES (?)',
            [event.id]
          );
          await conn.commit();

          await auditRepo.log('payment_confirmed', 'payment', payment.id, {
            stripeSessionId: session.id,
            reservationId: payment.reservation_id,
          });

          if (payment.reservation_id) {
            sendConfirmationEmailAsync(payment.id, payment.reservation_id).catch((err) => {
              console.error('[email] Confirmation send failed:', err);
            });
          }
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [paymentRows] = await conn.execute(
            'SELECT id FROM payments WHERE provider_ref = ? AND status = ? LIMIT 1',
            [session.id, 'pending']
          );
          const payment = paymentRows[0];
          if (payment) {
            await conn.execute(
              'UPDATE payments SET status = ? WHERE id = ?',
              ['expired', payment.id]
            );
          }

          await conn.execute(
            'INSERT INTO webhook_events (stripe_event_id) VALUES (?)',
            [event.id]
          );
          await conn.commit();
        } catch (err) {
          await conn.rollback();
          throw err;
        } finally {
          conn.release();
        }
        break;
      }
      default:
        console.log('[Stripe webhook] unhandled event', event.type, event.id);
    }

    res.status(200).json({ received: true });
  })
);

module.exports = router;
