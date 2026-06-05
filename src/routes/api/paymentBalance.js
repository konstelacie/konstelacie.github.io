const express = require('express');
const Stripe = require('stripe');
const { asyncHandler, ApiError } = require('../../middleware/apiError');
const { getPool } = require('../../db');
const { checkoutExpiresAtFromNow } = require('../../config/checkoutHold');
const { mysqlLocalDateToYmd } = require('../../lib/slotApiMap');
const { timeKeyForGridIndex } = require('../../config/slotGrid');
const { verifyBalancePayToken } = require('../../lib/balancePayToken');
const sessionPricing = require('../../lib/sessionPricing');
const paymentBackend = require('../../config/paymentBackend');
const { loadBalanceReservationState } = require('../../lib/balancePayReservationState');
const auditRepo = require('../../db/repositories/auditRepo');
const {
  paymentsMutationLimiter,
  balancePayContextLimiter,
  balancePayStartLimiter,
} = require('../../middleware/rateLimits');

const router = express.Router();

const MIN_SUPPLEMENT_EUR = 1;
const MAX_SUPPLEMENT_EUR = 50_000;

function invalidLinkError() {
  return new ApiError('INVALID_BALANCE_LINK', 'This link is invalid or has expired.', 404);
}

function mapSlotForClient(resv) {
  const gridIndex = Number(resv.grid_index);
  return {
    localDate: mysqlLocalDateToYmd(resv.local_date),
    gridIndex,
    timeKey: timeKeyForGridIndex(gridIndex),
    timezone: resv.timezone,
    startAt: resv.start_at_utc.toISOString(),
    endAt: resv.end_at_utc.toISOString(),
  };
}

router.get(
  '/context',
  balancePayContextLimiter,
  asyncHandler(async (req, res) => {
    const rawToken = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    const decoded = verifyBalancePayToken(rawToken);
    if (!decoded) {
      throw invalidLinkError();
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const data = await loadBalanceReservationState(pool, decoded.reservationId);
    if (data.kind === 'missing') {
      throw invalidLinkError();
    }

    const { resv, paidCents, topupAlreadyCompleted, topupPending } = data;

    if (resv.status !== 'confirmed') {
      return res.json({
        ok: true,
        state: 'not_available',
        message: 'Platba doplatku pre túto rezerváciu nie je dostupná.',
      });
    }

    if (paidCents < sessionPricing.MIN_SESSION_TOTAL_CENTS) {
      return res.json({
        ok: true,
        state: 'not_available',
        message:
          `Doplatok cez tento odkaz bude možný až po dosiahnutí minimálnej úhrady ${sessionPricing.MIN_SESSION_TOTAL_EUR} € za sedenie.`,
      });
    }

    if (topupAlreadyCompleted) {
      return res.json({
        ok: true,
        state: 'already_completed',
        message: 'Voliteľný doplatok za toto sedenie už bol zaznamenaný. Ďakujeme.',
        paidCents,
      });
    }

    if (topupPending) {
      return res.json({
        ok: true,
        state: 'checkout_pending',
        message: 'Platba je rozpracovaná. Dokonči ju v okne Stripe alebo skús znova neskôr.',
        paidCents,
      });
    }

    const suggested = sessionPricing.suggestedSupplementsFromPaid(paidCents).map((row) => ({
      targetTotalEur: row.targetTotalEur,
      supplementEur: Math.round(row.supplementCents / 100),
      supplementCents: row.supplementCents,
    }));

    res.json({
      ok: true,
      state: 'ready',
      paidCents,
      paidEuros: Math.round((paidCents / 100) * 100) / 100,
      minSupplementEur: MIN_SUPPLEMENT_EUR,
      defaultCustomSupplementEur: (() => {
        const rawCents = Math.max(0, sessionPricing.DEFAULT_CUSTOM_FULL_PAYMENT_EUR * 100 - paidCents);
        return Math.max(MIN_SUPPLEMENT_EUR, Math.ceil(rawCents / 100));
      })(),
      suggestedSupplements: suggested,
      slot: mapSlotForClient(resv),
    });
  })
);

router.post(
  '/start',
  paymentsMutationLimiter,
  balancePayStartLimiter,
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const rawToken = typeof body.token === 'string' ? body.token.trim() : '';
    const decoded = verifyBalancePayToken(rawToken);
    if (!decoded) {
      throw invalidLinkError();
    }

    const supplementEur = parseInt(body.supplementEur, 10);
    if (!Number.isInteger(supplementEur) || supplementEur < MIN_SUPPLEMENT_EUR || supplementEur > MAX_SUPPLEMENT_EUR) {
      throw new ApiError(
        'VALIDATION_ERROR',
        `supplementEur must be an integer between ${MIN_SUPPLEMENT_EUR} and ${MAX_SUPPLEMENT_EUR}`,
        400
      );
    }
    const supplementCents = supplementEur * 100;

    const backend = paymentBackend.backendForFunnelName(resv.funnel_name || 'site');
    let stripeSecret;
    try {
      stripeSecret = paymentBackend.requireStripeSecret(backend);
    } catch {
      throw new ApiError('INTERNAL_ERROR', 'Stripe not configured', 503);
    }

    const pool = getPool();
    if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

    const data = await loadBalanceReservationState(pool, decoded.reservationId);
    if (data.kind === 'missing') {
      throw invalidLinkError();
    }

    const { resv, paidCents, topupAlreadyCompleted, topupPending } = data;

    if (resv.status !== 'confirmed') {
      throw new ApiError('BALANCE_NOT_ALLOWED', 'Supplementary payment is not available for this reservation.', 409);
    }
    if (paidCents < sessionPricing.MIN_SESSION_TOTAL_CENTS) {
      throw new ApiError('BALANCE_NOT_ALLOWED', 'Minimum session payment not reached yet.', 409);
    }
    if (topupAlreadyCompleted) {
      throw new ApiError('BALANCE_ALREADY_PAID', 'A supplementary payment was already completed.', 409);
    }
    if (topupPending) {
      throw new ApiError('BALANCE_CHECKOUT_PENDING', 'A checkout is already in progress.', 409);
    }

    const suggestedList = sessionPricing.suggestedSupplementsFromPaid(paidCents);
    const isSuggestedAmount = suggestedList.some((r) => r.supplementCents === supplementCents);
    const minCents = MIN_SUPPLEMENT_EUR * 100;
    const maxCents = MAX_SUPPLEMENT_EUR * 100;
    if (!isSuggestedAmount && (supplementCents < minCents || supplementCents > maxCents)) {
      throw new ApiError('VALIDATION_ERROR', 'Invalid supplement amount', 400);
    }

    const checkoutExpiresAt = checkoutExpiresAtFromNow();
    const checkoutExpiresUnix = Math.floor(checkoutExpiresAt.getTime() / 1000);
    const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get('host')}`;
    const successUrl = `${baseUrl}/platba-doplatok?paid=1&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${baseUrl}/platba-doplatok?token=${encodeURIComponent(rawToken)}`;

    const stripe = new Stripe(stripeSecret);
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
                name: 'Doplatok za sedenie',
                description: 'Voliteľný doplatok k už uhradenej rezervácii',
              },
              unit_amount: supplementCents,
            },
            quantity: 1,
          },
        ],
        customer_email: resv.email || undefined,
        metadata: {
          checkoutPurpose: 'balance_topup',
          reservationId: String(decoded.reservationId),
        },
        success_url: successUrl,
        cancel_url: cancelUrl,
      });
    } catch (e) {
      console.error('[payments/balance/start] Stripe checkout.sessions.create', e);
      throw new ApiError(
        'STRIPE_ERROR',
        process.env.NODE_ENV === 'production' ? 'Payment provider error' : e.message || 'Stripe error',
        502
      );
    }

    const userId = resv.user_id != null ? Number(resv.user_id) : null;
    const slotId = Number(resv.slot_id);

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();

      const [again] = await conn.execute(
        `SELECT id FROM payments
         WHERE reservation_id = ? AND payment_type = 'topup' AND status = 'pending'
           AND checkout_expires_at > NOW(3)
         FOR UPDATE`,
        [decoded.reservationId]
      );
      if (again.length > 0) {
        await conn.rollback();
        try {
          await stripe.checkout.sessions.expire(session.id);
        } catch (expireErr) {
          console.error('[payments/balance/start] expire after race', session.id, expireErr);
        }
        throw new ApiError('BALANCE_CHECKOUT_PENDING', 'A checkout is already in progress.', 409);
      }

      await conn.execute(
        `INSERT INTO payments (user_id, reservation_id, slot_id, provider, provider_ref, payment_type, amount_cents, currency, status, checkout_expires_at)
         VALUES (?, ?, ?, 'stripe', ?, 'topup', ?, 'eur', 'pending', ?)`,
        [userId, decoded.reservationId, slotId, session.id, supplementCents, checkoutExpiresAt]
      );

      await conn.commit();
    } catch (e) {
      await conn.rollback();
      try {
        await stripe.checkout.sessions.expire(session.id);
      } catch (expireErr) {
        console.error('[payments/balance/start] expire after DB failure', session.id, expireErr);
      }
      throw e;
    } finally {
      conn.release();
    }

    try {
      await auditRepo.log('balance_topup_started', 'reservation', decoded.reservationId, {
        stripeSessionId: session.id,
        supplementCents,
      });
    } catch (auditErr) {
      console.error('[payments/balance/start] audit failed', auditErr);
    }

    res.json({
      ok: true,
      url: session.url,
      checkoutSessionId: session.id,
    });
  })
);

module.exports = router;
