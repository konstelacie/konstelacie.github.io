/**
 * Stripe payment reconciliation — detector only, no auto-repair.
 * See docs/plans/payment-hook-improvements.md Phase 5.
 */

const stripeReconciliationService = require('../services/stripeReconciliationService');

module.exports = {
  name: 'stripe-reconciliation',

  async run() {
    const { skipped, caseA, caseB, errors } = await stripeReconciliationService.runStripeReconciliation();
    return {
      skipped,
      caseA,
      caseB,
      errors,
    };
  },
};
