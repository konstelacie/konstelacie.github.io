const systemAlertsRepo = require('../db/repositories/systemAlertsRepo');
const { logLine } = require('../lib/structuredLog');

const ALERT_TYPES = {
  BILLING_DOCUMENT_CREATION_FAILED: 'billing_document_creation_failed',
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
  const existing = await systemAlertsRepo.findOpenByTypeAndEntity(type, entityType, entityId);
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

module.exports = {
  ALERT_TYPES,
  createOpenAlert,
  createBillingDocumentCreationFailed,
};
