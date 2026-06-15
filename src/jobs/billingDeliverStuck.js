/**
 * KROS webhook missing recovery: admin alert + optional billing-delayed email.
 * No legacy CT-PDF fallback. See docs/plans/payment-hook-improvements.md Phase 4.
 */

const billingDeliveryService = require('../services/billingDeliveryService');

module.exports = {
  name: 'billing-deliver-stuck',

  async run() {
    const { alerted, delayedEmailsQueued, delayedEmailsSent, skipped, errors } =
      await billingDeliveryService.processStuckKrosWebhookMissingBatch();

    return {
      alerted,
      delayedEmailsQueued,
      delayedEmailsSent,
      skipped,
      errors: errors.map((e) => `billing_document ${e.billingDocumentId}: ${e.error}`),
    };
  },
};
