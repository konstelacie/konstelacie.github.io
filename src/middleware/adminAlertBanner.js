const systemAlertsRepo = require('../db/repositories/systemAlertsRepo');
const cronHealthService = require('../services/cronHealthService');
const capiHealthService = require('../services/capiHealthService');

/**
 * Loads unresolved critical alert count (open + acknowledged) into res.locals for authenticated admin pages.
 * Also checks cron staleness so cron_not_running persists while scheduled tasks are down.
 */
async function adminAlertBanner(req, res, next) {
  res.locals.openCriticalAlertCount = 0;
  if (req.session && req.session.adminLoggedIn === true) {
    try {
      await cronHealthService.checkCronHealth();
      await capiHealthService.checkCapiDeliveryHealth();
      res.locals.openCriticalAlertCount = await systemAlertsRepo.getOpenCriticalCount();
    } catch (err) {
      console.error('[admin/alert-banner]', err);
    }
  }
  next();
}

module.exports = { adminAlertBanner };
