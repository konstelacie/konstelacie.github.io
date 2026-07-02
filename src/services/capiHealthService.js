const config = require('../config');
const { getPool } = require('../db');
const systemAlertService = require('./systemAlertService');
const { logLine } = require('../lib/structuredLog');

const FAILED_LOOKBACK_HOURS = 24;
const FAILED_THRESHOLD = 8;
/** Min interval between capi_send_log COUNT checks (admin banner path). */
const DELIVERY_CHECK_INTERVAL_MS = 10 * 60 * 1000;

let lastDeliveryCheckAt = 0;
/** @type {{ healthy: boolean, skipped?: boolean, failedCount?: number, alerted?: boolean } | null} */
let lastDeliveryCheckResult = null;

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
 * Throttled — at most one DB COUNT per DELIVERY_CHECK_INTERVAL_MS; otherwise returns cache.
 * @returns {Promise<{ healthy: boolean, skipped?: boolean, failedCount?: number, alerted?: boolean }>}
 */
async function runDeliveryHealthCheck() {
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

async function checkCapiDeliveryHealth(now = Date.now()) {
  if (
    lastDeliveryCheckResult != null &&
    now - lastDeliveryCheckAt < DELIVERY_CHECK_INTERVAL_MS
  ) {
    return lastDeliveryCheckResult;
  }

  const result = await runDeliveryHealthCheck();
  lastDeliveryCheckAt = now;
  lastDeliveryCheckResult = result;
  return result;
}

/** @internal Test helper — resets throttle cache between test cases. */
function resetDeliveryHealthCacheForTests() {
  lastDeliveryCheckAt = 0;
  lastDeliveryCheckResult = null;
}

module.exports = {
  FAILED_LOOKBACK_HOURS,
  FAILED_THRESHOLD,
  DELIVERY_CHECK_INTERVAL_MS,
  countRecentFailedCapiSends,
  checkCapiConfigAtStartup,
  checkCapiDeliveryHealth,
  resetDeliveryHealthCacheForTests,
};
