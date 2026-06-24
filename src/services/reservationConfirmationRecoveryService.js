const { getPool } = require('../db');
const { ApiError } = require('../middleware/apiError');
const reservationsRepo = require('../db/repositories/reservationsRepo');
const emailDeliveryTasksRepo = require('../db/repositories/emailDeliveryTasksRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const emailService = require('./emailService');
const systemAlertService = require('./systemAlertService');
const auditRepo = require('../db/repositories/auditRepo');
const {
  buildConfirmationEmailPayload,
  maskRecipientEmail,
} = require('../lib/confirmationEmailStatus');

/**
 * @param {string} sessionId Stripe Checkout Session id (cs_…)
 * @returns {Promise<{
 *   payment: object;
 *   reservation: object;
 *   slot: object;
 *   task: object|null;
 *   logRow: object|null;
 *   confirmationEmail: { status: string, recipientMasked: string }|null;
 * }|null>}
 */
async function loadCheckoutRecoveryContext(sessionId) {
  const pool = getPool();
  if (!pool) throw new ApiError('INTERNAL_ERROR', 'Database not configured', 503);

  const [paymentRows] = await pool.execute(
    `SELECT p.id, p.reservation_id, p.status AS payment_status, p.amount_cents, p.currency
     FROM payments p
     WHERE p.provider_ref = ? LIMIT 1`,
    [sessionId]
  );
  const payment = paymentRows[0];
  if (!payment?.reservation_id) return null;

  const [resRows] = await pool.execute(
    `SELECT r.id, r.email, r.status AS reservation_status, r.slot_id, r.payment_type AS reservation_payment_type
     FROM reservations r WHERE r.id = ?`,
    [payment.reservation_id]
  );
  const reservation = resRows[0];
  if (!reservation) return null;

  const [slotRows] = await pool.execute(
    'SELECT start_at_utc, end_at_utc, timezone FROM slots WHERE id = ?',
    [reservation.slot_id]
  );
  const slot = slotRows[0];
  if (!slot) return null;

  const task = await emailDeliveryTasksRepo.findByTemplateEntity(
    emailDeliveryTasksRepo.RESERVATION_CONFIRMATION_TEMPLATE,
    emailDeliveryTasksRepo.ENTITY_TYPE_RESERVATION,
    reservation.id
  );
  const logRow = await emailSentLogRepo.findLatestConfirmationLogForReservation(reservation.id);
  const confirmationEmail = buildConfirmationEmailPayload(task, logRow, reservation.email ?? null);

  return { payment, reservation, slot, task, logRow, confirmationEmail };
}

/**
 * Client self-service: correct reservation email and resend confirmation after bounce/failed send.
 * @param {string} sessionId
 * @param {string} newEmail validated format
 */
async function fixConfirmationEmailForCheckoutSession(sessionId, newEmail) {
  const ctx = await loadCheckoutRecoveryContext(sessionId);
  if (!ctx) {
    throw new ApiError('NOT_FOUND', 'Platbu sa nepodarilo nájsť.', 404);
  }

  const { payment, reservation, slot, task } = ctx;

  if (payment.payment_status !== 'completed') {
    throw new ApiError('PAYMENT_NOT_COMPLETED', 'Platba ešte nie je dokončená.', 409);
  }

  if (reservation.reservation_status !== 'confirmed') {
    throw new ApiError('RESERVATION_NOT_CONFIRMED', 'Rezervácia nie je potvrdená.', 409);
  }

  const deliveryStatus = ctx.confirmationEmail?.status;
  if (deliveryStatus !== 'bounced' && deliveryStatus !== 'failed') {
    throw new ApiError(
      'CONFIRMATION_EMAIL_OK',
      'Potvrdenie sa už podarilo doručiť alebo ešte odchádza.',
      409
    );
  }

  const normalizedNew = newEmail.trim().toLowerCase();
  const normalizedCurrent = String(reservation.email || '').trim().toLowerCase();

  if (normalizedNew !== normalizedCurrent) {
    if (await reservationsRepo.hasActiveReservationForEmail(newEmail, reservation.id)) {
      throw new ApiError(
        'EMAIL_HAS_RESERVATION',
        'Tento e-mail už má inú aktívnu rezerváciu.',
        409
      );
    }

    const updateResult = await reservationsRepo.adminUpdateEmail(reservation.id, newEmail);
    if (!updateResult.ok) {
      throw new ApiError('UPDATE_FAILED', 'Nepodarilo sa aktualizovať e-mail rezervácie.', 500);
    }
  }

  const result = await emailService.sendReservationConfirmation(
    {
      to: newEmail,
      slot,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      bookingPaymentType: reservation.reservation_payment_type === 'full' ? 'full' : 'deposit',
      resend: true,
      showAsResend: false,
    },
    { entity_type: 'reservation', entity_id: reservation.id, actorType: 'system' }
  );

  if (result.skipped) {
    throw new ApiError(
      'EMAIL_PROVIDER_NOT_CONFIGURED',
      'E-mail sa nepodarilo odoslať. Skús to prosím neskôr alebo nás kontaktuj.',
      503
    );
  }

  if (!result.ok) {
    throw new ApiError(
      'EMAIL_SEND_FAILED',
      'Odoslanie potvrdenia zlyhalo. Skús to prosím znova.',
      502
    );
  }

  await systemAlertService.resolveEmailBounced(reservation.id);
  await auditRepo.log(
    'reservation_confirmation_resent',
    'reservation',
    reservation.id,
    { to: newEmail, via: 'checkout_fix' },
    'anon'
  );

  const RESEND_TEMPLATE_ID = 'reservation-confirmation-resend';
  let logRow = await emailSentLogRepo.findLatestConfirmationLogForReservation(reservation.id);

  const resendLogMatchesSend = (row) =>
    row?.template_id === RESEND_TEMPLATE_ID &&
    (!result.messageId || row.provider_message_id === result.messageId);

  let resendLogged = resendLogMatchesSend(logRow);

  if (!resendLogged) {
    const alreadyResend = await emailSentLogRepo.wasAlreadySent(
      RESEND_TEMPLATE_ID,
      'reservation',
      reservation.id
    );
    if (!alreadyResend) {
      await emailSentLogRepo.log({
        recipientEmail: newEmail,
        templateId: RESEND_TEMPLATE_ID,
        entityType: 'reservation',
        entityId: reservation.id,
        providerMessageId: result.messageId ?? null,
        actorType: 'system',
      });
    }
    logRow = await emailSentLogRepo.findLatestConfirmationLogForReservation(reservation.id);
    resendLogged = resendLogMatchesSend(logRow);
  }

  let confirmationEmail = buildConfirmationEmailPayload(task, logRow, newEmail);

  if (
    !confirmationEmail ||
    confirmationEmail.status === 'bounced' ||
    confirmationEmail.status === 'failed'
  ) {
    confirmationEmail = {
      status: 'sent',
      recipientMasked: maskRecipientEmail(newEmail),
    };
  }

  return { confirmationEmail };
}

module.exports = {
  loadCheckoutRecoveryContext,
  fixConfirmationEmailForCheckoutSession,
};
