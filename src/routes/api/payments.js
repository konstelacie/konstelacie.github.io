const express = require('express');
const Stripe = require('stripe');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const auditRepo = require('../../db/repositories/auditRepo');
const locksRepo = require('../../db/repositories/locksRepo');
const { FUNNEL_INSTANCES } = require('../../config/funnelInstances');
const pageVisibility = require('../../config/pageVisibility');
const paymentBackend = require('../../config/paymentBackend');
const { expireStripeCheckoutSession } = require('../../lib/stripeCheckout');
const {
  FULL_PAYMENT_CHECKOUT_EUR,
  reservationDepositCentsForFunnel,
} = require('../../lib/bookingCheckoutAmounts');
const { parseFunnelAttribution } = require('../funnels');
const { timeKeyForGridIndex } = require('../../config/slotGrid');
const { mysqlLocalDateToYmd } = require('../../lib/slotApiMap');
const { validateSlotId, validateEmail, validateLockToken } = require('../../middleware/validators');
const { slotPassesBookingWindow } = require('../../lib/slotBookingRules');
const { checkoutExpiresAtFromNow, lockExpiresAtAfterCheckoutCancel } = require('../../config/checkoutHold');
const paymentsRepo = require('../../db/repositories/paymentsRepo');
const { scheduleLeadEvent } = require('../../db/repositories/leadEventsRepo');
const { leadContextFromRequest, centsToLeadAmount } = require('../../lib/leadEventContext');
const { extractMetaAttribution, updatePaymentMetaAttribution } = require('../../lib/metaAttribution');
const { scheduleCapiInitiateCheckout } = require('../../services/capiSender');
const emailDeliveryTasksRepo = require('../../db/repositories/emailDeliveryTasksRepo');
const emailSentLogRepo = require('../../db/repositories/emailSentLogRepo');
const { buildConfirmationEmailPayload } = require('../../lib/confirmationEmailStatus');
const { ensureEmailAvailableForBooking } = require('../../lib/bookingEmailAvailability');
const { bookingCannotCompleteError } = require('../../lib/bookingApiMessages');
const { handleCaptchaGate, ROUTE_PAYMENT_START } = require('../../lib/captcha');
const {
  paymentsStatusLimiter,
  paymentsMutationLimiter,
  paymentStartEmailLimiter,
  paymentFixConfirmationEmailLimiter,
} = require('../../middleware/rateLimits');
const {
  fixConfirmationEmailForCheckoutSession,
} = require('../../services/reservationConfirmationRecoveryService');

const paymentBalanceRouter = require('./paymentBalance');

const router = express.Router();

function fireInitiateCheckoutCapi(req, { email, paymentId, providerRef, cents, paymentTypeForDb, funnel, attribution }) {
  const leadCtx = leadContextFromRequest(req);
  scheduleCapiInitiateCheckout({
    email,
    paymentId,
    providerRef,
    amountCents: cents,
    paymentType: paymentTypeForDb,
    funnel,
    sourceUrl: leadCtx.sourceUrl,
    attribution,
  });
}

router.use('/balance', paymentBalanceRouter);

function bookingHashFallback(funnelName) {
  const publicPath = pageVisibility.buildPublicPath(funnelName);
  if (!publicPath) return '/#booking';
  return publicPath === '/' ? '/#booking' : `${publicPath}#booking`;
}

/** Root-relative path (+ optional ?query #hash) for Stripe cancel_url; must match the booking page path. */
function validateCancelReturn(raw, funnelName) {
  const expectedPath = pageVisibility.buildPublicPath(funnelName) || '/';
  const fallback = bookingHashFallback(funnelName);
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  const s = raw.trim();
  if (s.length > MAX_CANCEL_RETURN_LEN) return fallback;
  if (!s.startsWith('/') || s.startsWith('//')) return fallback;
  if (s.includes('..')) return fallback;

  const pathOnly = pageVisibility.normalizePathOnly(s);
  if (pathOnly !== expectedPath) return fallback;
  return s;
}

function validatePaymentType(raw) {
  if (raw === 'deposit' || raw === 'full') return raw;
  throw new ApiError('VALIDATION_ERROR', 'paymentType must be deposit or full', 400);
}

function validateAmount(raw, paymentType) {
  if (paymentType === 'deposit') return null;
  const amount = parseInt(raw, 10);
  if (!Number.isInteger(amount) || amount !== FULL_PAYMENT_CHECKOUT_EUR) {
    throw new ApiError(
      'VALIDATION_ERROR',
      `amount must be ${FULL_PAYMENT_CHECKOUT_EUR} when paymentType is full`,
      400
    );
  }
  return amount * 100; // euros → cents
}

function validateReturnPath(raw) {
  const pathOnly = pageVisibility.normalizePathOnly(typeof raw === 'string' ? raw : '/');
  const funnelName = pageVisibility.pathToFunnelName(pathOnly);
  if (funnelName && FUNNEL_INSTANCES.includes(funnelName)) {
    return funnelName;
  }
  return 'site';
}

function buildStripeSuccessUrl(baseUrl, funnelName) {
  const publicPath = pageVisibility.buildPublicPath(funnelName) || '/';
  const qs = 'payment_pending=1&session_id={CHECKOUT_SESSION_ID}';
  if (publicPath === '/') {
    return `${baseUrl}/?${qs}`;
  }
  return `${baseUrl}${publicPath}?${qs}`;
}

function schedulePaymentPathSelectedLeadEvent(req, { email, slotId, funnel, cents, paymentTypeForDb }) {
  const leadCtx = leadContextFromRequest(req);
  scheduleLeadEvent('payment_path_selected', {
    email,
    slotId,
    formId: funnel.funnelName || leadCtx.formId,
    sourceUrl: leadCtx.sourceUrl,
    amount: centsToLeadAmount(cents),
    currency: 'eur',
    metadata: {
      paymentType: paymentTypeForDb,
      funnelCampaign: funnel.funnelCampaign,
      funnelVideoId: funnel.funnelVideoId,
    },
  });
}

function schedulePaymentRetryLeadEvent(
  req,
  { email, slotId, funnel, cents, paymentTypeForDb, providerRef, reason }
) {
  const leadCtx = leadContextFromRequest(req);
  scheduleLeadEvent('payment_retry', {
    email,
    slotId,
    formId: funnel.funnelName || leadCtx.formId,
    sourceUrl: leadCtx.sourceUrl,
    amount: centsToLeadAmount(cents),
    currency: 'eur',
    metadata: {
      checkoutSessionId: providerRef,
      paymentType: paymentTypeForDb,
      funnelCampaign: funnel.funnelCampaign,
      ...(reason ? { reason } : {}),
    },
  });
}

function normalizeOptionalText(raw, maxLen) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  return s.slice(0, maxLen);
}

function validateBillingInput(body) {
  const billingName = String(body.billingName ?? '').trim().slice(0, 255);
  if (!billingName) {
    throw new ApiError('VALIDATION_ERROR', 'billingName is required', 400);
  }
  const billingIsCompany = body.billingIsCompany === true || body.billingIsCompany === 1 || body.billingIsCompany === '1';
  const billingCountryRaw = normalizeOptionalText(body.billingCountry, 2);
  const billingCountry = (billingCountryRaw || 'SK').toUpperCase();

  const out = {
    billingName,
    billingIsCompany,
    billingCompanyName: normalizeOptionalText(body.billingCompanyName, 255),
    billingIco: normalizeOptionalText(body.billingIco, 20),
    billingDic: normalizeOptionalText(body.billingDic, 20),
    billingIcDph: normalizeOptionalText(body.billingIcDph, 20),
    billingStreet: normalizeOptionalText(body.billingStreet, 255),
    billingCity: normalizeOptionalText(body.billingCity, 100),
    billingPostCode: normalizeOptionalText(body.billingPostCode, 20),
    billingCountry: /^[A-Z]{2}$/.test(billingCountry) ? billingCountry : 'SK',
  };

  if (billingIsCompany) {
    if (!out.billingCompanyName || !out.billingStreet || !out.billingCity || !out.billingPostCode) {
      throw new ApiError('VALIDATION_ERROR', 'Missing required company billing fields', 400);
    }
    if (!out.billingIco || !/^\d{8}$/.test(out.billingIco)) {
      throw new ApiError('VALIDATION_ERROR', 'billingIco must be exactly 8 digits', 400);
    }
  }
  return out;
}

router.get(
  '/status',
  paymentsStatusLimiter,
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
        `SELECT r.id, r.email, r.status AS reservation_status, r.slot_id, r.payment_type AS reservation_payment_type
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

    let confirmationEmail = null;
    if (reservation?.id) {
      const task = await emailDeliveryTasksRepo.findByTemplateEntity(
        emailDeliveryTasksRepo.RESERVATION_CONFIRMATION_TEMPLATE,
        emailDeliveryTasksRepo.ENTITY_TYPE_RESERVATION,
        reservation.id
      );
      const logRow = await emailSentLogRepo.findLatestConfirmationLogForReservation(reservation.id);
      confirmationEmail = buildConfirmationEmailPayload(task, logRow, reservation.email ?? null);
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
            paymentType: reservation.reservation_payment_type,
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
      meetingUrl: (process.env.SESSION_MEETING_URL || '').trim() || null,
      confirmationEmail,
    });
  })
);

router.post(
  '/fix-confirmation-email',
  paymentFixConfirmationEmailLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const sessionId = typeof body.session_id === 'string' ? body.session_id.trim() : '';
    if (!sessionId.startsWith('cs_')) {
      throw new ApiError(
        'VALIDATION_ERROR',
        'Chýba platný identifikátor platby.',
        400
      );
    }

    const email = validateEmail(body.email, true);
    const { confirmationEmail } = await fixConfirmationEmailForCheckoutSession(sessionId, email);

    res.json({
      ok: true,
      confirmationEmail,
    });
  })
);

/**
 * User left Stripe Checkout (cancel/back). Expire the Checkout Session, mark payment expired,
 * and set the slot lock to now + clamp(remaining checkout window, 5 min … 15 min).
 */
router.post(
  '/abandon-checkout',
  paymentsMutationLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const slotId = validateSlotId(body.slotId);
    const lockToken = validateLockToken(body.lockToken);
    const checkoutSessionId =
      typeof body.checkoutSessionId === 'string' ? body.checkoutSessionId.trim() : '';
    if (!checkoutSessionId.startsWith('cs_')) {
      throw new ApiError('VALIDATION_ERROR', 'checkoutSessionId must be a Stripe Checkout Session id', 400);
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const conn = await pool.getConnection();
    let lockExpiresAt;
    try {
      await conn.beginTransaction();

      const [payRows] = await conn.execute(
        `SELECT id, slot_id, checkout_expires_at FROM payments WHERE provider_ref = ? AND status = 'pending' AND provider = 'stripe' FOR UPDATE`,
        [checkoutSessionId]
      );
      const payment = payRows[0];
      if (!payment || Number(payment.slot_id) !== slotId) {
        await conn.rollback();
        throw bookingCannotCompleteError(409);
      }

      const [lockRows] = await conn.execute(
        'SELECT id FROM slot_locks WHERE slot_id = ? AND lock_token = ? AND expires_at > NOW(3) FOR UPDATE',
        [slotId, lockToken]
      );
      if (lockRows.length === 0) {
        await conn.rollback();
        throw bookingCannotCompleteError(409);
      }

      const coAt = payment.checkout_expires_at;
      const coMs = coAt instanceof Date ? coAt.getTime() : new Date(coAt).getTime();
      const remainingCheckoutMs =
        Number.isFinite(coMs) ? Math.max(0, coMs - Date.now()) : 0;
      lockExpiresAt = lockExpiresAtAfterCheckoutCancel(remainingCheckoutMs);

      const [upd] = await conn.execute(
        `UPDATE payments SET status = 'expired' WHERE id = ? AND status = 'pending'`,
        [payment.id]
      );
      if (upd.affectedRows === 0) {
        await conn.rollback();
        throw bookingCannotCompleteError(409);
      }

      await conn.execute(
        'UPDATE slot_locks SET expires_at = ? WHERE slot_id = ? AND lock_token = ?',
        [lockExpiresAt, slotId, lockToken]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    try {
      await expireStripeCheckoutSession(checkoutSessionId);
    } catch (e) {
      console.error('[payments/abandon-checkout] Stripe expire failed', checkoutSessionId, e);
    }

    try {
      await auditRepo.log('checkout_abandoned', 'slot', slotId, { checkoutSessionId });
    } catch (auditErr) {
      console.error('[payments/abandon-checkout] audit', auditErr);
    }

    res.status(200).json({
      ok: true,
      lockExpiresAt: lockExpiresAt.toISOString(),
    });
  })
);

router.post(
  '/start',
  paymentsMutationLimiter,
  paymentStartEmailLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const slotId = validateSlotId(body.slotId);
    const lockToken = validateLockToken(body.lockToken);
    const email = validateEmail(body.email, true);
    const billing = validateBillingInput(body);

    const captchaGate = await handleCaptchaGate(req, res, { route: ROUTE_PAYMENT_START, slotId });
    if (!captchaGate.proceed) {
      return res.status(captchaGate.status).json(captchaGate.body);
    }

    await ensureEmailAvailableForBooking(email, { exceptSlotId: slotId, exceptLockToken: lockToken });
    const paymentType = validatePaymentType(body.paymentType);
    const amountCents = validateAmount(body.amount, paymentType);
    const funnel = parseFunnelAttribution(body);
    const funnelName = validateReturnPath(body.returnPath);
    const metaAttribution = extractMetaAttribution(req, body);
    const paymentBackendName = paymentBackend.backendForFunnelName(funnelName);
    let stripeSecret;
    try {
      stripeSecret = paymentBackend.requireStripeSecret(paymentBackendName);
    } catch {
      throw new ApiError('INTERNAL_ERROR', 'Stripe not configured', 503);
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    let cents;
    let paymentTypeForDb;
    if (paymentType === 'deposit') {
      cents = reservationDepositCentsForFunnel(funnelName);
      paymentTypeForDb = 'deposit';
    } else {
      cents = amountCents;
      paymentTypeForDb = 'session';
    }

    const baseUrl = process.env.BASE_URL || (req.protocol + '://' + req.get('host'));
    const successUrl = buildStripeSuccessUrl(baseUrl, funnelName);
    const cancelReturnPath = validateCancelReturn(body.cancelReturn, funnelName);
    const cancelUrl = `${baseUrl}${cancelReturnPath}`;

    const checkoutExpiresAt = checkoutExpiresAtFromNow();
    const checkoutExpiresUnix = Math.floor(checkoutExpiresAt.getTime() / 1000);

    const stripe = new Stripe(stripeSecret);

    let idempotentProviderRef = null;
    let idempotentPaymentId = null;
    let idempotentLockExpiresAt = null;
    let userId;

    const holdConn = await pool.getConnection();
    try {
      await holdConn.beginTransaction();
      await paymentsRepo.reconcileExpiredStripeCheckouts(holdConn, { slotId });

      const [slotRows] = await holdConn.execute('SELECT id, status, start_at_utc FROM slots WHERE id = ? FOR UPDATE', [
        slotId,
      ]);
      const slot = slotRows[0];
      if (!slot) {
        throw bookingCannotCompleteError(409);
      }
      if (slot.status !== 'open') {
        throw bookingCannotCompleteError(409);
      }
      if (!slotPassesBookingWindow(slot)) {
        throw bookingCannotCompleteError(409);
      }

      const [existingRes] = await holdConn.execute(
        "SELECT id FROM reservations WHERE slot_id = ? AND status IN ('pending_payment','confirmed') LIMIT 1",
        [slotId]
      );
      if (existingRes.length > 0) {
        throw bookingCannotCompleteError(409);
      }

      const [idemRows] = await holdConn.execute(
        `SELECT p.id, p.provider_ref FROM payments p
         INNER JOIN slot_locks sl ON sl.slot_id = p.slot_id AND sl.lock_token = ?
         WHERE p.slot_id = ? AND p.status = 'pending' AND p.provider = 'stripe'
           AND p.checkout_expires_at > NOW(3) AND sl.expires_at > NOW(3)
         FOR UPDATE`,
        [lockToken, slotId]
      );

      if (idemRows.length > 0) {
        idempotentProviderRef = idemRows[0].provider_ref;
        idempotentPaymentId = idemRows[0].id;
        const [lockExpRow] = await holdConn.execute(
          'SELECT expires_at FROM slot_locks WHERE slot_id = ? AND lock_token = ? LIMIT 1',
          [slotId, lockToken]
        );
        idempotentLockExpiresAt = lockExpRow[0]?.expires_at ?? null;
        await holdConn.commit();
      } else {
        const [pendingOther] = await holdConn.execute(
          `SELECT id FROM payments WHERE slot_id = ? AND status = 'pending' AND provider = 'stripe'
           AND checkout_expires_at > NOW(3) FOR UPDATE`,
          [slotId]
        );
        if (pendingOther.length > 0) {
          throw bookingCannotCompleteError(409);
        }

        const held = await locksRepo.setLockCheckoutHoldConn(holdConn, slotId, lockToken, email, checkoutExpiresAt);
        if (!held) {
          throw bookingCannotCompleteError(409);
        }

        const [userRows] = await holdConn.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (userRows.length > 0) {
          userId = userRows[0].id;
        } else {
          const [ins] = await holdConn.execute('INSERT INTO users (email) VALUES (?)', [email]);
          userId = ins.insertId;
        }

        await holdConn.commit();
      }
    } catch (e) {
      await holdConn.rollback();
      throw e;
    } finally {
      holdConn.release();
    }

    if (idempotentProviderRef) {
      let existingSession;
      try {
        existingSession = await stripe.checkout.sessions.retrieve(idempotentProviderRef);
      } catch (e) {
        console.error('[payments/start] idempotent retrieve', idempotentProviderRef, e);
        throw new ApiError(
          'STRIPE_ERROR',
          process.env.NODE_ENV === 'production' ? 'Payment provider error' : e.message || 'Stripe error',
          502
        );
      }
      if (!existingSession?.url) {
        throw new ApiError('STRIPE_ERROR', 'Payment provider error', 502);
      }
      const lockExpiresAt = idempotentLockExpiresAt
        ? idempotentLockExpiresAt instanceof Date
          ? idempotentLockExpiresAt
          : new Date(idempotentLockExpiresAt)
        : checkoutExpiresAt;

      schedulePaymentRetryLeadEvent(req, {
        email,
        slotId,
        funnel,
        cents,
        paymentTypeForDb,
        providerRef: idempotentProviderRef,
      });

      try {
        await updatePaymentMetaAttribution(pool, idempotentProviderRef, metaAttribution);
      } catch (attrErr) {
        console.error('[payments/start] meta attribution update (idempotent)', attrErr);
      }

      fireInitiateCheckoutCapi(req, {
        email,
        paymentId: idempotentPaymentId,
        providerRef: idempotentProviderRef,
        cents,
        paymentTypeForDb,
        funnel,
        attribution: metaAttribution,
      });

      return res.status(200).json({
        ok: true,
        url: existingSession.url,
        checkoutSessionId: idempotentProviderRef,
        lockExpiresAt: lockExpiresAt.toISOString(),
      });
    }

    schedulePaymentPathSelectedLeadEvent(req, {
      email,
      slotId,
      funnel,
      cents,
      paymentTypeForDb,
    });

    let session;
    try {
      session = await stripe.checkout.sessions.create({
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
          billingName: billing.billingName,
          billingIsCompany: billing.billingIsCompany ? '1' : '0',
          billingCompanyName: billing.billingCompanyName || '',
          billingIco: billing.billingIco || '',
          billingDic: billing.billingDic || '',
          billingIcDph: billing.billingIcDph || '',
          billingStreet: billing.billingStreet || '',
          billingCity: billing.billingCity || '',
          billingPostCode: billing.billingPostCode || '',
          billingCountry: billing.billingCountry || 'SK',
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (e) {
      console.error('[payments/start] Stripe checkout.sessions.create', e);
      throw new ApiError(
        'STRIPE_ERROR',
        process.env.NODE_ENV === 'production' ? 'Payment provider error' : e.message || 'Stripe error',
        502
      );
    }

    const conn2 = await pool.getConnection();
    let newPaymentId = null;
    try {
      await conn2.beginTransaction();
      await paymentsRepo.reconcileExpiredStripeCheckouts(conn2, { slotId });

      const [dup] = await conn2.execute(
        `SELECT id, provider_ref FROM payments WHERE slot_id = ? AND status = 'pending' AND provider = 'stripe'
         AND checkout_expires_at > NOW(3) FOR UPDATE`,
        [slotId]
      );
      if (dup.length > 0) {
        await conn2.rollback();
        const firstRef = dup[0].provider_ref;
        const [lockExpRows] = await pool.execute(
          'SELECT expires_at FROM slot_locks WHERE slot_id = ? AND lock_token = ? LIMIT 1',
          [slotId, lockToken]
        );
        const lockExp = lockExpRows[0]?.expires_at;
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch (expireErr) {
          console.error('[payments/start] expire duplicate session after race', session.id, expireErr);
        }
        let existingSession;
        try {
          existingSession = await stripe.checkout.sessions.retrieve(firstRef);
        } catch (e) {
          console.error('[payments/start] retrieve after race', firstRef, e);
          throw new ApiError(
            'STRIPE_ERROR',
            process.env.NODE_ENV === 'production' ? 'Payment provider error' : e.message || 'Stripe error',
            502
          );
        }
        if (!existingSession?.url) {
          throw new ApiError('STRIPE_ERROR', 'Payment provider error', 502);
        }
        const lockExpiresAt = lockExp
          ? lockExp instanceof Date
            ? lockExp
            : new Date(lockExp)
          : checkoutExpiresAt;

        schedulePaymentRetryLeadEvent(req, {
          email,
          slotId,
          funnel,
          cents,
          paymentTypeForDb,
          providerRef: firstRef,
          reason: 'race_duplicate',
        });

        try {
          await updatePaymentMetaAttribution(pool, firstRef, metaAttribution);
        } catch (attrErr) {
          console.error('[payments/start] meta attribution update (race)', attrErr);
        }

        fireInitiateCheckoutCapi(req, {
          email,
          paymentId: dup[0].id,
          providerRef: firstRef,
          cents,
          paymentTypeForDb,
          funnel,
          attribution: metaAttribution,
        });

        return res.status(200).json({
          ok: true,
          url: existingSession.url,
          checkoutSessionId: firstRef,
          lockExpiresAt: lockExpiresAt.toISOString(),
        });
      }

      const [insertResult] = await conn2.execute(
        `INSERT INTO payments (
           user_id, reservation_id, slot_id, provider, provider_ref, payment_type,
           amount_cents, currency, status, checkout_expires_at,
           meta_fbp, meta_fbc, marketing_consent, client_ip, client_user_agent, suppressed_tracking
         )
         VALUES (?, NULL, ?, 'stripe', ?, ?, ?, 'eur', 'pending', ?, ?, ?, ?, ?, ?, ?)`,
        [
          userId,
          slotId,
          session.id,
          paymentTypeForDb,
          cents,
          checkoutExpiresAt,
          metaAttribution.metaFbp,
          metaAttribution.metaFbc,
          metaAttribution.marketingConsent ? 1 : 0,
          metaAttribution.clientIp,
          metaAttribution.clientUserAgent,
          metaAttribution.suppressTracking ? 1 : 0,
        ]
      );
      newPaymentId = insertResult.insertId;

      await conn2.commit();
    } catch (e) {
      await conn2.rollback();
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        console.error('[payments/start] Stripe expire after DB failure', session.id, expireErr);
      }
      throw e;
    } finally {
      conn2.release();
    }

    try {
      await auditRepo.log('payment_started', 'slot', slotId, {
        paymentType: paymentTypeForDb,
        amountCents: cents,
        sessionId: session.id,
        funnelName: funnel.funnelName,
        funnelCampaign: funnel.funnelCampaign,
        funnelVideoId: funnel.funnelVideoId,
      });
    } catch (auditErr) {
      console.error('[payments/start] auditRepo.log failed (payment still ok)', auditErr);
    }

    const leadCtx = leadContextFromRequest(req);
    scheduleLeadEvent('initiate_checkout', {
      email,
      slotId,
      formId: funnel.funnelName || leadCtx.formId,
      sourceUrl: leadCtx.sourceUrl,
      amount: centsToLeadAmount(cents),
      currency: 'eur',
      metadata: {
        checkoutSessionId: session.id,
        paymentType: paymentTypeForDb,
        funnelCampaign: funnel.funnelCampaign,
        funnelVideoId: funnel.funnelVideoId,
      },
    });

    fireInitiateCheckoutCapi(req, {
      email,
      paymentId: newPaymentId,
      providerRef: session.id,
      cents,
      paymentTypeForDb,
      funnel,
      attribution: metaAttribution,
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
