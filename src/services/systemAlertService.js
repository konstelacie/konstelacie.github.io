const systemAlertsRepo = require('../db/repositories/systemAlertsRepo');
const { logLine } = require('../lib/structuredLog');

const ALERT_TYPES = {
  BILLING_DOCUMENT_CREATION_FAILED: 'billing_document_creation_failed',
  RESERVATION_CONFIRMATION_EMAIL_FAILED: 'reservation_confirmation_email_failed',
  KROS_WEBHOOK_MISSING: 'kros_webhook_missing',
};

/**
 * Create an open critical alert, or return existing open alert for same type+entity.
 * @returns {Promise<number|null>} alert id
 */
async function createOpenAlert({
  severity = 'critical',
  type,
  entityType,
  entityId,
  title,
  message,
  metadata,
}) {
  const existing = await systemAlertsRepo.findUnresolvedByTypeAndEntity(type, entityType, entityId);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity,
    type,
    entityType,
    entityId,
    title,
    message,
    metadata,
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: type,
    entityType,
    entityId,
  });

  return id;
}

/**
 * @param {object} params
 * @param {number} params.paymentId
 * @param {number|null} [params.reservationId]
 * @param {string} [params.stripeSessionId]
 * @param {string} params.errorMessage
 */
async function createBillingDocumentCreationFailed({
  paymentId,
  reservationId,
  stripeSessionId,
  errorMessage,
}) {
  return createOpenAlert({
    type: ALERT_TYPES.BILLING_DOCUMENT_CREATION_FAILED,
    entityType: 'payment',
    entityId: paymentId,
    title: 'Vytvorenie platobného dokladu zlyhalo',
    message:
      'Platba je dokončená a rezervácia je potvrdená, ale záznam platobného dokladu sa nepodarilo vytvoriť. Vyžaduje manuálny zásah.',
    metadata: {
      paymentId,
      reservationId: reservationId ?? null,
      stripeSessionId: stripeSessionId ?? null,
      errorMessage: errorMessage || 'unknown',
    },
  });
}

/**
 * @param {object} params
 * @param {number} params.taskId
 * @param {number|null} [params.reservationId]
 * @param {number|null} [params.paymentId]
 * @param {string} [params.recipientEmail]
 * @param {number} params.attemptCount
 * @param {string} params.errorMessage
 */
async function createReservationConfirmationEmailFailed({
  taskId,
  reservationId,
  paymentId,
  recipientEmail,
  attemptCount,
  errorMessage,
}) {
  return createOpenAlert({
    type: ALERT_TYPES.RESERVATION_CONFIRMATION_EMAIL_FAILED,
    entityType: 'reservation',
    entityId: reservationId ?? null,
    title: 'Potvrdzovací e-mail rezervácie sa nepodarilo doručiť',
    message:
      'Rezervácia je potvrdená a platba dokončená, ale potvrzovací e-mail sa po opakovaných pokusoch neodoslal. Vyžaduje manuálny zásah.',
    metadata: {
      taskId,
      reservationId: reservationId ?? null,
      paymentId: paymentId ?? null,
      recipientEmail: recipientEmail ?? null,
      attemptCount,
      errorMessage: errorMessage || 'unknown',
    },
  });
}

/**
 * @param {object} params
 * @param {number} params.billingDocumentId
 * @param {number} params.paymentId
 * @param {number|null} [params.reservationId]
 * @param {string|null} [params.krosExternalId]
 * @param {string|null} [params.krosStatus]
 * @param {string|null} [params.krosAcceptedAt]
 * @param {number} params.ageMinutes
 * @param {string|null} [params.customerEmail]
 */
async function createKrosWebhookMissing({
  billingDocumentId,
  paymentId,
  reservationId,
  krosExternalId,
  krosStatus,
  krosAcceptedAt,
  ageMinutes,
  customerEmail,
}) {
  return createOpenAlert({
    type: ALERT_TYPES.KROS_WEBHOOK_MISSING,
    entityType: 'billing_document',
    entityId: billingDocumentId,
    title: 'KROS webhook neprišiel',
    message:
      'KROS prijal platobný doklad, ale webhook s výsledkom neprišiel v očakávanom čase. Rezervácia a platba zostávajú platné. Vyžaduje manuálnu kontrolu.',
    metadata: {
      billingDocumentId,
      paymentId,
      reservationId: reservationId ?? null,
      krosExternalId: krosExternalId ?? null,
      krosStatus: krosStatus ?? null,
      krosAcceptedAt: krosAcceptedAt ?? null,
      ageMinutes,
      customerEmail: customerEmail ?? null,
    },
  });
}

module.exports = {
  ALERT_TYPES,
  createOpenAlert,
  createBillingDocumentCreationFailed,
  createReservationConfirmationEmailFailed,
  createKrosWebhookMissing,
};
