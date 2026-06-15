const express = require('express');
const Stripe = require('stripe');
const { logLine } = require('../../lib/structuredLog');
const { asyncHandler } = require('../../middleware/apiError');
const { validateLockToken } = require('../../middleware/validators');
const { getPool } = require('../../db');
const checkoutPostCommitService = require('../../services/checkoutPostCommitService');
const emailDeliveryTaskService = require('../../services/emailDeliveryTaskService');
const { constructStripeEvent } = require('../../lib/stripeWebhook');

const router = express.Router();

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
  const billingName = md.billingName != null ? String(md.billingName).trim().slice(0, 255) : '';
  if (!billingName) {
    throw new Error('checkout.billing_name_missing');
  }
  const billingIsCompany = String(md.billingIsCompany || '') === '1' ? 1 : 0;
  const billingCompanyName = md.billingCompanyName ? String(md.billingCompanyName).trim().slice(0, 255) : null;
  const billingIco = md.billingIco ? String(md.billingIco).trim().slice(0, 20) : null;
  const billingDic = md.billingDic ? String(md.billingDic).trim().slice(0, 20) : null;
  const billingIcDph = md.billingIcDph ? String(md.billingIcDph).trim().slice(0, 20) : null;
  const billingStreet = md.billingStreet ? String(md.billingStreet).trim().slice(0, 255) : null;
  const billingCity = md.billingCity ? String(md.billingCity).trim().slice(0, 100) : null;
  const billingPostCode = md.billingPostCode ? String(md.billingPostCode).trim().slice(0, 20) : null;
  const billingCountryRaw = md.billingCountry ? String(md.billingCountry).trim().toUpperCase() : 'SK';
  const billingCountry = /^[A-Z]{2}$/.test(billingCountryRaw) ? billingCountryRaw : 'SK';
  const funnelName = funnelNameRaw ? funnelNameRaw.slice(0, 32) : null;
  const funnelCampaign = funnelCampaignRaw ? funnelCampaignRaw.slice(0, 64) : null;
  const funnelVideoId = funnelVideoIdRaw ? funnelVideoIdRaw.slice(0, 128) : null;

  const [insRes] = await conn.execute(
    `INSERT INTO reservations (slot_id, user_id, email, billing_name, billing_is_company, billing_company_name,
      billing_ico, billing_dic, billing_ic_dph, billing_street, billing_city, billing_post_code, billing_country,
      status, payment_type, lock_token, funnel_name, funnel_campaign, funnel_video_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?)`,
    [
      slotId,
      payment.user_id,
      customerEmail,
      billingName,
      billingIsCompany,
      billingCompanyName,
      billingIco,
      billingDic,
      billingIcDph,
      billingStreet,
      billingCity,
      billingPostCode,
      billingCountry,
      reservationPaymentType,
      lockTokenRaw,
      funnelName,
      funnelCampaign,
      funnelVideoId,
    ]
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

    if (!sig) {
      logLine({
        level: 'warn',
        tag: 'stripe_webhook',
        requestId: req.id,
        error: 'missing_signature_or_webhook_secret',
      });
      return res.status(400).json({ ok: false, error: 'Missing signature or webhook secret' });
    }

    let event;
    let paymentBackendName;
    try {
      ({ event, backend: paymentBackendName } = constructStripeEvent(req.body, sig));
    } catch (err) {
      logLine({
        level: 'warn',
        tag: 'stripe_webhook',
        requestId: req.id,
        error: 'invalid_signature',
      });
      return res.status(400).json({ ok: false, error: 'Invalid signature' });
    }

    logLine({
      level: 'info',
      tag: 'stripe_webhook_received',
      requestId: req.id,
      eventType: event.type,
      eventId: event.id,
    });

    const pool = getPool();
    if (!pool) {
      return res.status(503).json({ ok: false, error: 'Database not configured' });
    }

    if (await isEventAlreadyProcessed(pool, event.id)) {
      logLine({
        level: 'info',
        tag: 'stripe_webhook',
        requestId: req.id,
        eventType: event.type,
        eventId: event.id,
        duplicate: true,
      });

      if (event.type === 'checkout.session.completed') {
        await checkoutPostCommitService.recoverBillingForCompletedCheckoutSession(
          event.data.object,
          event.id,
          paymentBackendName
        );
      }

      return res.status(200).json({ received: true });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const conn = await pool.getConnection();
        let reservationIdForEmail = null;
        let paymentId = null;
        let slotId = null;
        let confirmationEmailTaskId = null;
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

          paymentId = payment.id;
          slotId = payment.slot_id;

          const md = session.metadata || {};
          const isBalanceTopup =
            payment.payment_type === 'topup' &&
            payment.reservation_id != null &&
            String(md.checkoutPurpose || '') === 'balance_topup';

          if (isBalanceTopup) {
            const rid = parseInt(md.reservationId, 10);
            if (!Number.isInteger(rid) || rid <= 0 || rid !== Number(payment.reservation_id)) {
              throw new Error('checkout.topup_reservation_mismatch');
            }
            reservationIdForEmail = null;
          } else {
            reservationIdForEmail = await ensureReservationForCheckoutPayment(conn, payment, session);
          }

          await conn.execute(
            'UPDATE payments SET status = ?, paid_at = NOW(3) WHERE id = ?',
            ['completed', payment.id]
          );

          if (reservationIdForEmail) {
            const [reservationRows] = await conn.execute(
              'SELECT email FROM reservations WHERE id = ? LIMIT 1',
              [reservationIdForEmail]
            );
            const recipientEmail = reservationRows[0]?.email;
            if (!recipientEmail) {
              throw new Error('checkout.reservation_email_missing');
            }
            confirmationEmailTaskId = await emailDeliveryTaskService.insertReservationConfirmationTask(conn, {
              paymentId: payment.id,
              reservationId: reservationIdForEmail,
              recipientEmail,
            });
          }

          await conn.execute('INSERT INTO webhook_events (stripe_event_id) VALUES (?)', [event.id]);
          await conn.commit();

          logLine({
            level: 'info',
            tag: 'stripe_webhook_checkout_completed',
            requestId: req.id,
            eventId: event.id,
            reservationId: reservationIdForEmail ?? payment.reservation_id,
            paymentId: payment.id,
            sessionId: session.id,
          });

          await checkoutPostCommitService.runCheckoutPostCommit({
            paymentId: payment.id,
            reservationId: reservationIdForEmail ?? payment.reservation_id ?? null,
            confirmationEmailTaskId,
            session,
            stripeEventId: event.id,
            paymentBackendName,
            slotId,
          });
        } catch (err) {
          await conn.rollback();
          // Stripe already captured funds — never mark payment `failed` here.
          logLine({
            level: 'error',
            tag: 'stripe_webhook_checkout_failed',
            requestId: req.id,
            eventId: event.id,
            paymentId,
            reservationId: reservationIdForEmail,
            sessionId: session.id,
            err: err?.message || String(err),
          });
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

          let didExpirePayment = false;
          if (payment) {
            const [upd] = await conn.execute(
              'UPDATE payments SET status = ? WHERE id = ? AND status = ?',
              ['expired', payment.id, 'pending']
            );
            didExpirePayment = upd.affectedRows > 0;
          }

          if (didExpirePayment && Number.isInteger(slotId) && slotId > 0 && lockTokenRaw) {
            await conn.execute('DELETE FROM slot_locks WHERE slot_id = ? AND lock_token = ?', [
              slotId,
              lockTokenRaw,
            ]);
          }

          await conn.execute('INSERT INTO webhook_events (stripe_event_id) VALUES (?)', [event.id]);
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
        logLine({
          level: 'info',
          tag: 'stripe_webhook_unhandled',
          requestId: req.id,
          eventType: event.type,
          eventId: event.id,
        });
    }

    res.status(200).json({ received: true });
  })
);

module.exports = router;
