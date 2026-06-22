/**
 * Retry due email delivery tasks (reservation confirmation, etc.).
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const emailDeliveryTaskService = require('../services/emailDeliveryTaskService');

module.exports = {
  name: 'email-delivery-tasks',

  async run() {
    const { due, sent, skipped, failed, errors } = await emailDeliveryTaskService.processDueTasks();
    return {
      due,
      sent,
      skipped,
      failed,
      errors,
    };
  },
};
