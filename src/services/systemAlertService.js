const systemAlertsRepo = require('../db/repositories/systemAlertsRepo');
const { getPool } = require('../db');
const { logLine } = require('../lib/structuredLog');

const ALERT_TYPES = {
  BILLING_DOCUMENT_CREATION_FAILED: 'billing_document_creation_failed',
  RESERVATION_CONFIRMATION_EMAIL_FAILED: 'reservation_confirmation_email_failed',
  EMAIL_BOUNCED: 'email_bounced',
  KROS_WEBHOOK_MISSING: 'kros_webhook_missing',
  KROS_PAYMENT_SYNC_FAILED: 'kros_payment_sync_failed',
  CRON_NOT_RUNNING: 'cron_not_running',
  STRIPE_PAYMENT_NEEDS_RECONCILIATION: 'stripe_payment_needs_reconciliation',
  STRIPE_RECONCILIATION_FAILED: 'stripe_reconciliation_failed',
  CAPI_MISCONFIGURED: 'capi_misconfigured',
  CAPI_AUTH_FAILED: 'capi_auth_failed',
  CAPI_DELIVERY_DEGRADED: 'capi_delivery_degraded',
  CAPI_POOL_UNAVAILABLE: 'capi_pool_unavailable',
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
 * @param {number} params.reservationId
 * @param {string} [params.recipientEmail]
 * @param {string} [params.providerMessageId]
 * @param {string|null} [params.bounceReason]
 * @param {'bounced'|'complained'} [params.deliveryStatus]
 */
async function createEmailBounced({
  reservationId,
  recipientEmail,
  providerMessageId,
  bounceReason,
  deliveryStatus = 'bounced',
}) {
  return createOpenAlert({
    type: ALERT_TYPES.EMAIL_BOUNCED,
    entityType: 'reservation',
    entityId: reservationId,
    title: 'Potvrdzovací e-mail sa nepodarilo doručiť (bounce)',
    message:
      'Rezervácia je potvrdená a e-mail bol odoslaný, ale doručenie zlyhalo (neplatná adresa alebo spam hlásenie). Skontroluj e-mail v detaile rezervácie a odošli znova na správnu adresu.',
    metadata: {
      reservationId,
      recipientEmail: recipientEmail ?? null,
      providerMessageId: providerMessageId ?? null,
      bounceReason: bounceReason ?? null,
      deliveryStatus,
    },
  });
}

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

/**
 * @param {object} params
 * @param {number} params.billingDocumentId
 * @param {number} params.paymentId
 * @param {number|null} [params.reservationId]
 * @param {string} [params.krosDocumentId]
 * @param {string} params.errorMessage
 * @param {number} [params.httpStatus]
 */
async function createKrosPaymentSyncFailed({
  billingDocumentId,
  paymentId,
  reservationId,
  krosDocumentId,
  errorMessage,
  httpStatus,
}) {
  return createOpenAlert({
    type: ALERT_TYPES.KROS_PAYMENT_SYNC_FAILED,
    entityType: 'billing_document',
    entityId: billingDocumentId,
    title: 'KROS úhrada faktúry sa nepodarila zaregistrovať',
    message:
      'Faktúra v KROS bola vytvorená, ale registrácia úhrady zlyhala. Zákazníkovi bol doklad odoslaný; účtovný stav v KROS treba skontrolovať alebo sync zopakovať.',
    metadata: {
      billingDocumentId,
      paymentId,
      reservationId: reservationId ?? null,
      krosDocumentId: krosDocumentId ?? null,
      errorMessage: errorMessage || 'unknown',
      httpStatus: httpStatus ?? null,
    },
  });
}

async function createCronNotRunning() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CRON_NOT_RUNNING);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity: 'critical',
    type: ALERT_TYPES.CRON_NOT_RUNNING,
    entityType: null,
    entityId: null,
    title: 'Cron nebeží',
    message:
      'Scheduled cron tasks have not run successfully within the expected time window. Email retries, reminders, and KROS monitoring may be delayed.',
    metadata: {
      checkedAt: new Date().toISOString(),
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.CRON_NOT_RUNNING,
  });

  return id;
}

/**
 * @param {object} params
 * @param {'missing_local_payment'|'missing_reservation'|'missing_confirmation_email_task'|'confirmation_email_permanently_failed'|'confirmation_email_bounced'} params.failureReason
 * @param {string} [params.stripeSessionId]
 * @param {number|null} [params.paymentId]
 * @param {string|null} [params.customerEmail]
 * @param {number|null} [params.amountCents]
 * @param {string|null} [params.currency]
 * @param {string|Date|null} [params.paymentTimestamp]
 * @param {number|null} [params.reservationId]
 */
async function createStripePaymentNeedsReconciliation({
  failureReason,
  stripeSessionId,
  paymentId,
  customerEmail,
  amountCents,
  currency,
  paymentTimestamp,
  reservationId,
}) {
  if (stripeSessionId) {
    const existing = await systemAlertsRepo.findUnresolvedByTypeAndStripeSessionId(
      ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
      stripeSessionId
    );
    if (existing) {
      return existing.id;
    }
  }

  if (paymentId != null) {
    const existing = await systemAlertsRepo.findUnresolvedByTypeAndEntity(
      ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
      'payment',
      paymentId
    );
    if (existing) {
      return existing.id;
    }
  }

  const entityType = paymentId != null ? 'payment' : 'stripe_session';
  const entityId = paymentId ?? null;

  const id = await systemAlertsRepo.createOpen({
    severity: 'critical',
    type: ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
    entityType,
    entityId,
    title: 'Stripe platba vyžaduje manuálnu kontrolu',
    message:
      'Zistený nesúlad medzi Stripe a lokálnym systémom. Rezervácia ani platobné doklady sa automaticky nevytvárajú — vyžaduje sa manuálne prešetrenie.',
    metadata: {
      failureReason,
      stripeSessionId: stripeSessionId ?? null,
      paymentId: paymentId ?? null,
      customerEmail: customerEmail ?? null,
      amountCents: amountCents ?? null,
      currency: currency ?? null,
      paymentTimestamp: paymentTimestamp
        ? paymentTimestamp instanceof Date
          ? paymentTimestamp.toISOString()
          : String(paymentTimestamp)
        : null,
      reservationId: reservationId ?? null,
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
    entityType,
    entityId,
    failureReason,
  });

  return id;
}

/**
 * Stripe reconciliation job could not run (API/network/config failure).
 * Not a payment mismatch — the detector itself is broken.
 * @param {string} errorMessage
 */
async function createStripeReconciliationFailed(errorMessage) {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.STRIPE_RECONCILIATION_FAILED);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity: 'critical',
    type: ALERT_TYPES.STRIPE_RECONCILIATION_FAILED,
    entityType: null,
    entityId: null,
    title: 'Stripe reconciliácia zlyhala',
    message:
      'Scheduled Stripe payment reconciliation could not run. Payment mismatches may go undetected until this is fixed.',
    metadata: {
      errorMessage: errorMessage || 'unknown',
      checkedAt: new Date().toISOString(),
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.STRIPE_RECONCILIATION_FAILED,
  });

  return id;
}

/**
 * Auto-resolve stripe_reconciliation_failed after a successful reconciliation run.
 * @returns {Promise<boolean>}
 */
async function resolveStripeReconciliationFailed() {
  const existing = await systemAlertsRepo.findUnresolvedByType(
    ALERT_TYPES.STRIPE_RECONCILIATION_FAILED
  );
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.STRIPE_RECONCILIATION_FAILED,
      auto: true,
    });
  }
  return result.ok;
}

/**
 * Auto-resolve cron_not_running after a successful cron run.
 * @returns {Promise<boolean>} true when an alert was resolved
 */
async function resolveCronNotRunning() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CRON_NOT_RUNNING);
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.CRON_NOT_RUNNING,
      auto: true,
    });
  }
  return result.ok;
}

/**
 * @param {number} reservationId
 * @returns {Promise<boolean>}
 */
async function createCapiMisconfigured() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_MISCONFIGURED);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity: 'critical',
    type: ALERT_TYPES.CAPI_MISCONFIGURED,
    entityType: null,
    entityId: null,
    title: 'Meta CAPI je nesprávne nakonfigurované',
    message:
      'Meta CAPI je zapnuté, ale chýba access token alebo pixel ID — server-side eventy sa neodosielajú.',
    metadata: {
      checkedAt: new Date().toISOString(),
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.CAPI_MISCONFIGURED,
  });

  return id;
}

/**
 * @returns {Promise<boolean>}
 */
async function resolveCapiMisconfigured() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_MISCONFIGURED);
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.CAPI_MISCONFIGURED,
      auto: true,
    });
  }
  return result.ok;
}

/**
 * @param {{ httpStatus: number, errorMessage?: string|null }} params
 */
async function createCapiAuthFailed({ httpStatus, errorMessage }) {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_AUTH_FAILED);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity: 'critical',
    type: ALERT_TYPES.CAPI_AUTH_FAILED,
    entityType: null,
    entityId: null,
    title: 'Meta CAPI autentifikácia zlyhala',
    message: `Meta CAPI odmieta požiadavky (${httpStatus}) — over META_CAPI_ACCESS_TOKEN v Events Manageri.`,
    metadata: {
      httpStatus,
      errorMessage: errorMessage || 'unknown',
      checkedAt: new Date().toISOString(),
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.CAPI_AUTH_FAILED,
    httpStatus,
  });

  return id;
}

/**
 * @returns {Promise<boolean>}
 */
async function resolveCapiAuthFailed() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_AUTH_FAILED);
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.CAPI_AUTH_FAILED,
      auto: true,
    });
  }
  return result.ok;
}

/**
 * @param {{ failedCount: number, threshold: number }} params
 */
async function createCapiDeliveryDegraded({ failedCount, threshold }) {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_DELIVERY_DEGRADED);
  if (existing) {
    return existing.id;
  }

  const id = await systemAlertsRepo.createOpen({
    severity: 'warning',
    type: ALERT_TYPES.CAPI_DELIVERY_DEGRADED,
    entityType: null,
    entityId: null,
    title: 'Meta CAPI doručovanie je degradované',
    message: `V posledných 24 hodinách zlyhalo ${failedCount} CAPI eventov (prah: ${threshold}). Skontroluj capi_send_log a Meta konfiguráciu.`,
    metadata: {
      failedCount,
      threshold,
      checkedAt: new Date().toISOString(),
    },
  });

  logLine({
    level: 'error',
    tag: 'system_alert_created',
    alertId: id,
    alertType: ALERT_TYPES.CAPI_DELIVERY_DEGRADED,
    failedCount,
    threshold,
  });

  return id;
}

/**
 * @returns {Promise<boolean>}
 */
async function resolveCapiDeliveryDegraded() {
  const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_DELIVERY_DEGRADED);
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.CAPI_DELIVERY_DEGRADED,
      auto: true,
    });
  }
  return result.ok;
}

async function createCapiPoolUnavailable() {
  if (!getPool()) {
    return null;
  }

  try {
    const existing = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CAPI_POOL_UNAVAILABLE);
    if (existing) {
      return existing.id;
    }

    const id = await systemAlertsRepo.createOpen({
      severity: 'critical',
      type: ALERT_TYPES.CAPI_POOL_UNAVAILABLE,
      entityType: null,
      entityId: null,
      title: 'Meta CAPI — databázové spojenie nedostupné',
      message:
        'CAPI logovanie vyžaduje DB pool, ktorý nie je k dispozícii. Server-side Meta eventy sa nemusia zapisovať ani odosielať.',
      metadata: {
        checkedAt: new Date().toISOString(),
      },
    });

    if (id != null) {
      logLine({
        level: 'error',
        tag: 'system_alert_created',
        alertId: id,
        alertType: ALERT_TYPES.CAPI_POOL_UNAVAILABLE,
      });
    }

    return id;
  } catch {
    return null;
  }
}

async function resolveEmailBounced(reservationId) {
  const existing = await systemAlertsRepo.findUnresolvedByTypeAndEntity(
    ALERT_TYPES.EMAIL_BOUNCED,
    'reservation',
    reservationId
  );
  if (!existing) {
    return false;
  }

  const result = await systemAlertsRepo.resolveAlert(existing.id);
  if (result.ok) {
    logLine({
      level: 'info',
      tag: 'system_alert_resolved',
      alertId: existing.id,
      alertType: ALERT_TYPES.EMAIL_BOUNCED,
      auto: false,
    });
  }
  return result.ok;
}

module.exports = {
  ALERT_TYPES,
  createOpenAlert,
  createBillingDocumentCreationFailed,
  createReservationConfirmationEmailFailed,
  createEmailBounced,
  createKrosWebhookMissing,
  createKrosPaymentSyncFailed,
  createCronNotRunning,
  createStripePaymentNeedsReconciliation,
  createStripeReconciliationFailed,
  resolveCronNotRunning,
  resolveStripeReconciliationFailed,
  createCapiMisconfigured,
  resolveCapiMisconfigured,
  createCapiAuthFailed,
  resolveCapiAuthFailed,
  createCapiDeliveryDegraded,
  resolveCapiDeliveryDegraded,
  createCapiPoolUnavailable,
  resolveEmailBounced,
};
