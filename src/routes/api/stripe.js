const express = require('express');
const Stripe = require('stripe');
const { asyncHandler } = require('../../middleware/apiError');
const { validateLockToken } = require('../../middleware/validators');
const { getPool } = require('../../db');
const auditRepo = require('../../db/repositories/auditRepo');
const emailService = require('../../services/emailService');
const billingDocumentService = require('../../services/billingDocumentService');
const billingDeliveryService = require('../../services/billingDeliveryService');

const router = express.Router();

async function sendConfirmationEmailAsync(paymentId, reservationId) {
  const pool = getPool();
  if (!pool) return;

  const [rows] = await pool.execute(
    `SELECT r.email, s.start_at_utc, s.end_at_utc, s.timezone, p.amount_cents, p.currency
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
      slot: { start_at_utc: row.start_at_utc, end_at_utc: row.end_at_utc, timezone: row.timezone },
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

/**
 * Create confirmed reservation, link payment, remove slot lock. Caller must hold a transaction on `conn`.
 * @returns {Promise<number>} reservation id
 */
async function ensureReservationForCheckoutPayment(conn, payment, session) {
  if (payment.reservation_id != null) {
    throw new Error('checkout.payment_already_linked');
  }
  if (payment.slot_id == null) {
    throw new Error('checkout.payment_missing_slot');
  }

  const md = session.metadata || {};
  const slotId = parseInt(md.slotId, 10);
  const lockTokenRaw = md.lockToken != null ? String(md.lockToken).trim() : '';
  if (!Number.isInteger(slotId) || slotId <= 0 || !lockTokenRaw) {
    throw new Error('checkout.metadata_missing');
  }
  try {
    validateLockToken(lockTokenRaw);
  } catch {
    throw new Error('checkout.invalid_lock_token');
  }
  if (Number(payment.slot_id) !== slotId) {
    throw new Error('checkout.slot_mismatch');
  }

  const customerEmail =
    (session.customer_email && String(session.customer_email).trim()) ||
    (session.customer_details && session.customer_details.email) ||
    '';
  if (!customerEmail) {
    throw new Error('checkout.no_email');
  }

  const [slotRows] = await conn.execute('SELECT id, status FROM slots WHERE id = ? FOR UPDATE', [slotId]);
  const slot = slotRows[0];
  if (!slot || slot.status !== 'open') {
    throw new Error('checkout.slot_not_open');
  }

  const [conflict] = await conn.execute(
    "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('pending_payment','confirmed') LIMIT 1",
    [slotId]
  );
  if (conflict.length > 0) {
    throw new Error('checkout.slot_already_reserved');
  }

  const reservationPaymentType = payment.payment_type === 'deposit' ? 'deposit' : 'full';
  const funnelNameRaw = md.funnelName != null ? String(md.funnelName).trim() : '';
  const funnelCampaignRaw = md.funnelCampaign != null ? String(md.funnelCampaign).trim() : '';
  const funnelVideoIdRaw = md.funnelVideoId != null ? String(md.funnelVideoId).trim() : '';
  const funnelName = funnelNameRaw ? funnelNameRaw.slice(0, 32) : null;
  const funnelCampaign = funnelCampaignRaw ? funnelCampaignRaw.slice(0, 64) : null;
  const funnelVideoId = funnelVideoIdRaw ? funnelVideoIdRaw.slice(0, 128) : null;

  const [insRes] = await conn.execute(
    `INSERT INTO reservations (slot_id, user_id, email, status, payment_type, lock_token,
      funnel_name, funnel_campaign, funnel_video_id)
     VALUES (?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
    [slotId, payment.user_id, customerEmail, reservationPaymentType, lockTokenRaw, funnelName, funnelCampaign, funnelVideoId]
  );
  const reservationId = insRes.insertId;

  await conn.execute('DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?', [slotId, lockTokenRaw]);

  await conn.execute('UPDATE payments SET reservation_id = ? WHERE id = ?', [reservationId, payment.id]);

  return reservationId;
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
        let reservationIdForEmail = null;
        try {
          await conn.beginTransaction();

          const [paymentRows] = await conn.execute(
            `SELECT p.id, p.reservation_id, p.user_id, p.slot_id, p.payment_type, p.amount_cents, p.currency,
                    u.email AS user_email, u.name AS user_name
             FROM payments p
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.provider_ref = ? AND p.status = ? LIMIT 1 FOR UPDATE`,
            [session.id, 'pending']
          );
          const payment = paymentRows[0];
          if (!payment) {
            await conn.rollback();
            console.warn('[Stripe webhook] checkout.session.completed: no pending payment for', session.id);
            break;
          }

          reservationIdForEmail = await ensureReservationForCheckoutPayment(conn, payment, session);

          await conn.execute(
            'UPDATE payments SET status = ?, paid_at = NOW(3) WHERE id = ?',
            ['completed', payment.id]
          );

          const [billingPaymentRows] = await conn.execute(
            `SELECT p.id, p.reservation_id, p.user_id, p.payment_type, p.amount_cents, p.currency,
                    r.email AS reservation_email, r.funnel_name, r.funnel_campaign, r.funnel_video_id,
                    u.email AS user_email, u.name AS user_name
             FROM payments p
             LEFT JOIN reservations r ON r.id = p.reservation_id
             LEFT JOIN users u ON u.id = p.user_id
             WHERE p.id = ? LIMIT 1`,
            [payment.id]
          );
          const paymentRowForBilling = billingPaymentRows[0];

          const billingDocumentId = await billingDocumentService.insertBillingDocumentForCompletedPayment(
            conn,
            { paymentRow: paymentRowForBilling, session, stripeEventId: event.id }
          );

          await conn.execute(
            'INSERT INTO webhook_events (stripe_event_id) VALUES (?)',
            [event.id]
          );
          await conn.commit();

          await auditRepo.log(
            'reservation_created',
            'reservation',
            reservationIdForEmail,
            {
              slotId: payment.slot_id,
              stripeSessionId: session.id,
              fromPaymentId: payment.id,
            },
            'system'
          );

          await auditRepo.log('payment_confirmed', 'payment', payment.id, {
            stripeSessionId: session.id,
            reservationId: reservationIdForEmail,
          });

          await auditRepo.log(
            'billing_document_recorded',
            'billing_document',
            billingDocumentId,
            { paymentId: payment.id, stripeSessionId: session.id },
            'system'
          );

          billingDeliveryService.processBillingDocumentDelivery(billingDocumentId).catch((err) => {
            console.error('[billing] Invoice PDF/email pipeline failed:', err);
          });

          if (reservationIdForEmail) {
            sendConfirmationEmailAsync(payment.id, reservationIdForEmail).catch((err) => {
              console.error('[email] Confirmation send failed:', err);
            });
          }
        } catch (err) {
          await conn.rollback();
          console.error('[Stripe webhook] checkout.session.completed failed:', session.id, err);
          throw err;
        } finally {
          conn.release();
        }
        break;
      }
      case 'checkout.session.expired': {
        const session = event.data.object;
        const md = session.metadata || {};
        let lockTokenRaw = md.lockToken != null ? String(md.lockToken).trim() : '';
        try {
          validateLockToken(lockTokenRaw);
        } catch {
          lockTokenRaw = '';
        }
        const conn = await pool.getConnection();
        try {
          await conn.beginTransaction();

          const [paymentRows] = await conn.execute(
            'SELECT id, slot_id FROM payments WHERE provider_ref = ? AND status = ? LIMIT 1',
            [session.id, 'pending']
          );
          const payment = paymentRows[0];
          const slotId =
            payment && payment.slot_id != null
              ? Number(payment.slot_id)
              : parseInt(md.slotId, 10);

          if (payment) {
            await conn.execute(
              'UPDATE payments SET status = ? WHERE id = ?',
              ['expired', payment.id]
            );
          }

          if (Number.isInteger(slotId) && slotId > 0 && lockTokenRaw) {
            await conn.execute('DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?', [
              slotId,
              lockTokenRaw,
            ]);
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
