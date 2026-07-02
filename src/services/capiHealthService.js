const config = require('../config');
const { getPool } = require('../db');
const systemAlertService = require('./systemAlertService');
const { logLine } = require('../lib/structuredLog');

const FAILED_LOOKBACK_HOURS = 24;
const FAILED_THRESHOLD = 8;

/**
 * @param {import('mysql2/promise').Pool} pool
 * @returns {Promise<number>}
 */
async function countRecentFailedCapiSends(pool) {
  const [rows] = await pool.execute(
    `SELECT COUNT(*) AS cnt FROM capi_send_log
     WHERE status = 'failed' AND created_at > DATE_SUB(NOW(3), INTERVAL ? HOUR)`,
    [FAILED_LOOKBACK_HOURS]
  );
  return Number(rows[0]?.cnt ?? 0);
}

/**
 * Check Meta CAPI config at application startup.
 * Creates capi_misconfigured when enabled but token/pixel missing; otherwise auto-resolves.
 * @returns {Promise<{ misconfigured: boolean }>}
 */
async function checkCapiConfigAtStartup() {
  const capi = config.metaCapi;
  if (capi.enabled && (!capi.accessToken || !capi.pixelId)) {
    const alertId = await systemAlertService.createCapiMisconfigured();
    logLine({
      level: 'error',
      tag: 'capi_config_misconfigured',
      alertId,
    });
    return { misconfigured: true };
  }

  await systemAlertService.resolveCapiMisconfigured();
  return { misconfigured: false };
}

/**
 * Threshold-based check for elevated CAPI delivery failures (last 24h).
 * @returns {Promise<{ healthy: boolean, skipped?: boolean, failedCount?: number, alerted?: boolean }>}
 */
async function checkCapiDeliveryHealth() {
  const pool = getPool();
  if (!pool) {
    return { healthy: true, skipped: true };
  }

  const failedCount = await countRecentFailedCapiSends(pool);
  if (failedCount > FAILED_THRESHOLD) {
    const alertId = await systemAlertService.createCapiDeliveryDegraded({
      failedCount,
      threshold: FAILED_THRESHOLD,
    });
    logLine({
      level: 'warn',
      tag: 'capi_delivery_degraded',
      failedCount,
      threshold: FAILED_THRESHOLD,
      alertId,
    });
    return { healthy: false, failedCount, alerted: Boolean(alertId) };
  }

  await systemAlertService.resolveCapiDeliveryDegraded();
  return { healthy: true, failedCount };
}

module.exports = {
  FAILED_LOOKBACK_HOURS,
  FAILED_THRESHOLD,
  countRecentFailedCapiSends,
  checkCapiConfigAtStartup,
  checkCapiDeliveryHealth,
};
