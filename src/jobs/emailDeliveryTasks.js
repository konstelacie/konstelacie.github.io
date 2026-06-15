/**
 * Retry due email delivery tasks (reservation confirmation, etc.).
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const emailDeliveryTaskService = require('../services/emailDeliveryTaskService');

module.exports = {
  name: 'email-delivery-tasks',

  async run() {
    const { sent, skipped, failed, errors } = await emailDeliveryTaskService.processDueTasks();
    return {
      sent,
      skipped,
      failed,
      errors,
    };
  },
};
