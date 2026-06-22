/**
 * Stripe payment reconciliation — detector only, no auto-repair.
 * See docs/plans/payment-hook-improvements.md Phase 5.
 */

const stripeReconciliationService = require('../services/stripeReconciliationService');

module.exports = {
  name: 'stripe-reconciliation',

  async run() {
    const { skipped, due, caseA, caseB, errors, detectorFailed } =
      await stripeReconciliationService.runStripeReconciliation();
    return {
      due,
      skipped,
      caseA,
      caseB,
      errors,
      detectorFailed: detectorFailed ?? false,
    };
  },
};
