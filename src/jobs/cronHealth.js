/**
 * Cron health check: detect stale last_successful_cron_run_at and alert.
 * Successful runs are recorded in jobs/index.js runAll() after all jobs finish.
 */

const cronHealthService = require('../services/cronHealthService');

module.exports = {
  name: 'cron-health',

  async run() {
    const { healthy, stale, alerted, lastRunAt } = await cronHealthService.checkCronHealth();
    return {
      healthy,
      stale,
      alerted,
      lastRunAt: lastRunAt ? lastRunAt.toISOString() : null,
      errors: [],
    };
  },
};
