const config = require('../config');
const paymentsRepo = require('../db/repositories/paymentsRepo');
const emailDeliveryTasksRepo = require('../db/repositories/emailDeliveryTasksRepo');
const emailSentLogRepo = require('../db/repositories/emailSentLogRepo');
const systemSettingsRepo = require('../db/repositories/systemSettingsRepo');
const systemAlertService = require('./systemAlertService');
const { listRecentCompletedCheckoutSessions } = require('../lib/stripeReconciliation');
const { logLine } = require('../lib/structuredLog');

const LAST_RUN_KEY = 'last_stripe_reconciliation_run_at';

function sessionCustomerEmail(session) {
  return (
    (session.customer_email && String(session.customer_email).trim()) ||
    (session.customer_details && session.customer_details.email) ||
    null
  );
}

function isBookingCheckoutSession(session) {
  const md = session.metadata || {};
  if (String(md.checkoutPurpose || '') === 'balance_topup') {
    return false;
  }
  const slotId = parseInt(md.slotId, 10);
  return Number.isInteger(slotId) && slotId > 0;
}

/**
 * @returns {Promise<{ skipped: boolean, caseA: number, caseB: number, errors: string[] }>}
 */
async function runStripeReconciliation(now = new Date()) {
  const errors = [];
  let caseA = 0;
  let caseB = 0;

  const lastRunAt = await systemSettingsRepo.getDateValue(LAST_RUN_KEY);
  const intervalMs = config.stripeReconciliation.intervalHours * 60 * 60 * 1000;
  if (lastRunAt && now.getTime() - lastRunAt.getTime() < intervalMs) {
    return { skipped: true, due: 0, caseA: 0, caseB: 0, errors: [] };
  }

  const lookbackMs = config.stripeReconciliation.lookbackHours * 60 * 60 * 1000;
  const since = new Date(now.getTime() - lookbackMs);
  const sinceUnix = Math.floor(since.getTime() / 1000);

  let stripeSessions = [];
  try {
    stripeSessions = await listRecentCompletedCheckoutSessions({
      sinceUnix,
      limitPerBackend: config.stripeReconciliation.maxSessionsPerBackend,
    });
  } catch (err) {
    const errorMessage = err?.message || String(err);
    errors.push(`stripe_list_failed: ${errorMessage}`);
    await systemAlertService.createStripeReconciliationFailed(errorMessage);
    logLine({
      level: 'error',
      tag: 'stripe_reconciliation_list_failed',
      err: errorMessage,
    });
    return { skipped: false, due: 0, caseA: 0, caseB: 0, errors, detectorFailed: true };
  }

  for (const { session } of stripeSessions) {
    if (!isBookingCheckoutSession(session)) {
      continue;
    }

    const localPayment = await paymentsRepo.findByProviderRef(session.id);
    if (!localPayment || localPayment.status !== 'completed') {
      await systemAlertService.createStripePaymentNeedsReconciliation({
        failureReason: 'missing_local_payment',
        stripeSessionId: session.id,
        paymentId: localPayment?.id ?? null,
        customerEmail: sessionCustomerEmail(session),
        amountCents: session.amount_total ?? null,
        currency: session.currency ?? null,
        paymentTimestamp: session.created ? new Date(session.created * 1000) : null,
        reservationId: localPayment?.reservation_id ?? null,
      });
      caseA++;
    }
  }

  const localPayments = await paymentsRepo.findCompletedBookingPaymentsSince(since);
  for (const payment of localPayments) {
    const issue = await detectLocalPaymentIssue(payment);
    if (!issue) {
      continue;
    }

    await systemAlertService.createStripePaymentNeedsReconciliation({
      failureReason: issue.failureReason,
      stripeSessionId: payment.provider_ref,
      paymentId: payment.id,
      customerEmail: payment.reservation_email || null,
      amountCents: payment.amount_cents,
      currency: payment.currency,
      paymentTimestamp: payment.paid_at,
      reservationId: payment.reservation_id,
    });
    caseB++;
  }

  await systemSettingsRepo.setDateValue(LAST_RUN_KEY, now);
  await systemAlertService.resolveStripeReconciliationFailed();

  logLine({
    level: 'info',
    tag: 'stripe_reconciliation_complete',
    caseA,
    caseB,
    stripeSessionsChecked: stripeSessions.length,
    localPaymentsChecked: localPayments.length,
  });

  return {
    skipped: false,
    due: stripeSessions.length + localPayments.length,
    caseA,
    caseB,
    errors,
  };
}

/**
 * @param {object} payment
 * @param {object|null} task
 * @param {boolean} [bounced=false]
 * @returns {{ failureReason: string }|null}
 */
function evaluateLocalPaymentIssue(payment, task, bounced = false) {
  if (payment.reservation_id == null) {
    return { failureReason: 'missing_reservation' };
  }

  if (!payment.reservation_status || payment.reservation_status !== 'confirmed') {
    return { failureReason: 'missing_reservation' };
  }

  if (!task) {
    return { failureReason: 'missing_confirmation_email_task' };
  }

  const exhausted =
    task.status === 'failed' && Number(task.attempt_count) >= Number(task.max_attempts);
  if (exhausted) {
    return { failureReason: 'confirmation_email_permanently_failed' };
  }

  if (bounced) {
    return { failureReason: 'confirmation_email_bounced' };
  }

  return null;
}

/**
 * @param {object} payment
 * @returns {Promise<{ failureReason: string }|null>}
 */
async function detectLocalPaymentIssue(payment) {
  const task = await emailDeliveryTasksRepo.findByTemplateEntity(
    emailDeliveryTasksRepo.RESERVATION_CONFIRMATION_TEMPLATE,
    emailDeliveryTasksRepo.ENTITY_TYPE_RESERVATION,
    payment.reservation_id
  );
  const bounced = await emailSentLogRepo.isBouncedForEntity(
    emailDeliveryTasksRepo.ENTITY_TYPE_RESERVATION,
    payment.reservation_id
  );
  return evaluateLocalPaymentIssue(payment, task, bounced);
}

module.exports = {
  LAST_RUN_KEY,
  runStripeReconciliation,
  detectLocalPaymentIssue,
  evaluateLocalPaymentIssue,
  isBookingCheckoutSession,
};
