/**
 * Cron job registry and orchestrator.
 * See docs/SCHEDULED-EMAILS-CRON.md.
 */

const cronHealth = require('./cronHealth');
const emailDeliveryTasks = require('./emailDeliveryTasks');
const preSessionReminder = require('./preSessionReminder');
const billingDeliverStuck = require('./billingDeliverStuck');
const stripeReconciliation = require('./stripeReconciliation');
const cronHealthService = require('../services/cronHealthService');
const systemAlertService = require('../services/systemAlertService');

const jobs = [
  cronHealth,
  emailDeliveryTasks,
  preSessionReminder,
  billingDeliverStuck,
  stripeReconciliation,
];

/**
 * Run all registered jobs and return aggregated results.
 * Records last_successful_cron_run_at and auto-resolves cron_not_running on success.
 * @returns {Promise<{ok: boolean, jobs: Array<{name: string, sent?: number, skipped?: number, errors?: string[]}>}>}
 */
async function runAll() {
  const results = [];

  for (const job of jobs) {
    try {
      const result = await job.run();
      results.push({
        name: job.name,
        ...result,
        sent: result.sent ?? 0,
        skipped: result.skipped ?? 0,
        failed: result.failed ?? 0,
        errors: result.errors ?? [],
      });
    } catch (err) {
      results.push({
        name: job.name,
        sent: 0,
        skipped: 0,
        errors: [err.message || String(err)],
      });
    }
  }

  await cronHealthService.recordSuccessfulCronRun();
  await systemAlertService.resolveCronNotRunning();

  return {
    ok: true,
    jobs: results,
  };
}

module.exports = { runAll, jobs };
