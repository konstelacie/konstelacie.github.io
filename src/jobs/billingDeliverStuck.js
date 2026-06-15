/**
 * KROS webhook fallback job: deliver internal CT-PDF + billing-invoice email
 * for stuck `accepted` billing documents (webhook never arrived).
 * See docs/EMAILING.md (KROS webhook fallback) and docs/SCHEDULED-EMAILS-CRON.md.
 */

const billingDeliveryService = require('../services/billingDeliveryService');

module.exports = {
  name: 'billing-deliver-stuck',

  async run() {
    const { processed, errors } =
      await billingDeliveryService.processStuckKrosAcceptedFallbackBatch();
    return {
      sent: processed,
      skipped: 0,
      errors: errors.map((e) => `billing_document ${e.billingDocumentId}: ${e.error}`),
    };
  },
};
