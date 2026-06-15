const config = require('../config');
const systemSettingsRepo = require('../db/repositories/systemSettingsRepo');
const systemAlertService = require('./systemAlertService');
const { logLine } = require('../lib/structuredLog');

const LAST_SUCCESS_KEY = 'last_successful_cron_run_at';

/**
 * @param {Date|null} lastRunAt
 * @param {Date} now
 * @param {number} thresholdMinutes
 */
function isCronStale(lastRunAt, now, thresholdMinutes) {
  if (!lastRunAt) {
    return false;
  }
  return now.getTime() - lastRunAt.getTime() > thresholdMinutes * 60 * 1000;
}

/**
 * Record that /api/cron/run completed successfully.
 */
async function recordSuccessfulCronRun(at = new Date()) {
  await systemSettingsRepo.setDateValue(LAST_SUCCESS_KEY, at);
}

/**
 * Check whether cron has been stale since the last successful run.
 * Creates cron_not_running alert when threshold exceeded.
 * When last_successful_cron_run_at is unset (before first successful cron), returns healthy — see docs/SCHEDULED-EMAILS-CRON.md.
 * @returns {Promise<{ healthy: boolean, stale: boolean, alerted: boolean, lastRunAt: Date|null }>}
 */
async function checkCronHealth(now = new Date()) {
  const lastRunAt = await systemSettingsRepo.getDateValue(LAST_SUCCESS_KEY);
  const thresholdMinutes = config.cronHealth.staleThresholdMinutes;
  const stale = isCronStale(lastRunAt, now, thresholdMinutes);

  if (!lastRunAt) {
    return { healthy: true, stale: false, alerted: false, lastRunAt: null };
  }

  if (!stale) {
    return { healthy: true, stale: false, alerted: false, lastRunAt };
  }

  const alertId = await systemAlertService.createCronNotRunning();
  logLine({
    level: 'error',
    tag: 'cron_health_stale',
    lastRunAt: lastRunAt.toISOString(),
    thresholdMinutes: config.cronHealth.staleThresholdMinutes,
    alertId,
  });

  return { healthy: false, stale: true, alerted: Boolean(alertId), lastRunAt };
}

module.exports = {
  LAST_SUCCESS_KEY,
  isCronStale,
  recordSuccessfulCronRun,
  checkCronHealth,
};
