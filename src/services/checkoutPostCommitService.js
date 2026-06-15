/**
 * Post-commit work after Stripe checkout.session.completed booking transaction.
 * Billing, KROS sync, and confirmation email must not roll back a paid reservation.
 */

const { logLine } = require('../lib/structuredLog');
const auditRepo = require('../db/repositories/auditRepo');
const billingDocumentService = require('./billingDocumentService');
const billingDeliveryService = require('./billingDeliveryService');
const emailDeliveryTaskService = require('./emailDeliveryTaskService');
const systemAlertService = require('./systemAlertService');
const { syncToKros } = require('./krosInvoiceService');

function startBillingDelivery(billingDocumentId) {
  billingDeliveryService.processBillingDocumentDelivery(billingDocumentId).catch((err) => {
    logLine({
      level: 'error',
      tag: 'billing_delivery',
      billingDocumentId,
      err: err?.message || String(err),
    });
  });
}

function startKrosSync(billingDocumentId, paymentBackendName) {
  syncToKros(billingDocumentId, { backend: paymentBackendName }).catch((err) => {
    logLine({
      level: 'error',
      tag: 'kros_sync',
      billingDocumentId,
      err: err?.message || String(err),
    });
  });
}

function startConfirmationEmailTask(confirmationEmailTaskId) {
  emailDeliveryTaskService.processTaskById(confirmationEmailTaskId).catch((err) => {
    logLine({
      level: 'error',
      tag: 'confirmation_email_task_failed',
      taskId: confirmationEmailTaskId,
      err: err?.message || String(err),
    });
  });
}

/**
 * @param {object} params
 * @param {number} params.paymentId
 * @param {number|null} params.reservationId
 * @param {number|null} [params.confirmationEmailTaskId]
 * @param {object} params.session - Stripe Checkout Session
 * @param {string} params.stripeEventId
 * @param {'test'|'prod'} params.paymentBackendName
 * @param {number|null} [params.slotId]
 * @param {object} [options]
 * @param {boolean} [options.skipAudits]
 * @param {boolean} [options.skipConfirmationEmail]
 * @returns {Promise<{ billingDocumentId: number|null, billingCreated: boolean, billingError: string|null }>}
 */
async function runCheckoutPostCommit({
  paymentId,
  reservationId,
  confirmationEmailTaskId,
  session,
  stripeEventId,
  paymentBackendName,
  slotId,
  options = {},
}) {
  const skipAudits = options.skipAudits === true;
  const skipConfirmationEmail = options.skipConfirmationEmail === true;

  if (confirmationEmailTaskId && !skipConfirmationEmail) {
    startConfirmationEmailTask(confirmationEmailTaskId);
  }

  if (!skipAudits) {
    if (reservationId) {
      await auditRepo.log(
        'reservation_created',
        'reservation',
        reservationId,
        {
          slotId: slotId ?? null,
          stripeSessionId: session.id,
          fromPaymentId: paymentId,
        },
        'system'
      );
    }

    await auditRepo.log('payment_confirmed', 'payment', paymentId, {
      stripeSessionId: session.id,
      reservationId,
    });
  }

  let billingDocumentId = null;
  let billingCreated = false;
  let billingError = null;

  try {
    const billingResult = await billingDocumentService.ensureBillingDocumentForCompletedPayment({
      paymentId,
      session,
      stripeEventId,
    });

    if (billingResult) {
      billingDocumentId = billingResult.billingDocumentId;
      billingCreated = billingResult.created;

      if (billingCreated) {
        if (!skipAudits) {
          await auditRepo.log(
            'billing_document_recorded',
            'billing_document',
            billingDocumentId,
            { paymentId, stripeSessionId: session.id, created: true },
            'system'
          );
        }

        startBillingDelivery(billingDocumentId);
        startKrosSync(billingDocumentId, paymentBackendName);
      } else {
        logLine({
          level: 'info',
          tag: 'billing_document_already_exists',
          paymentId,
          billingDocumentId,
          stripeSessionId: session.id,
        });
      }
    }
  } catch (err) {
    billingError = err?.message || String(err);
    logLine({
      level: 'error',
      tag: 'billing_document_creation_failed',
      paymentId,
      reservationId,
      stripeSessionId: session.id,
      err: billingError,
    });
    await systemAlertService.createBillingDocumentCreationFailed({
      paymentId,
      reservationId,
      stripeSessionId: session.id,
      errorMessage: billingError,
    });
  }

  return { billingDocumentId, billingCreated, billingError };
}

/**
 * Recover billing when webhook event was already processed but billing row is missing.
 */
async function recoverBillingForCompletedCheckoutSession(session, stripeEventId, paymentBackendName) {
  const { getPool } = require('../db');
  const pool = getPool();
  if (!pool) return;

  const [rows] = await pool.execute(
    `SELECT id, reservation_id, slot_id FROM payments WHERE provider_ref = ? AND status = 'completed' LIMIT 1`,
    [session.id]
  );
  const payment = rows[0];
  if (!payment) return;

  await runCheckoutPostCommit({
    paymentId: payment.id,
    reservationId: payment.reservation_id ?? null,
    confirmationEmailTaskId: null,
    session,
    stripeEventId,
    paymentBackendName,
    slotId: payment.slot_id ?? null,
    options: { skipAudits: true, skipConfirmationEmail: true },
  });
}

module.exports = {
  runCheckoutPostCommit,
  recoverBillingForCompletedCheckoutSession,
};
