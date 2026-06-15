const systemAlertsRepo = require('../db/repositories/systemAlertsRepo');

/**
 * Loads unresolved critical alert count (open + acknowledged) into res.locals for authenticated admin pages.
 */
async function adminAlertBanner(req, res, next) {
  res.locals.openCriticalAlertCount = 0;
  if (req.session && req.session.adminLoggedIn === true) {
    try {
      res.locals.openCriticalAlertCount = await systemAlertsRepo.getOpenCriticalCount();
    } catch (err) {
      console.error('[admin/alert-banner]', err);
    }
  }
  next();
}

module.exports = { adminAlertBanner };
