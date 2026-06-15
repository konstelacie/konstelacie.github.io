const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const adminLayoutSrc = fs.readFileSync(
  path.join(__dirname, '../src/views/layouts/admin.ejs'),
  'utf8'
);
const adminRoutesSrc = fs.readFileSync(path.join(__dirname, '../src/routes/admin.js'), 'utf8');
const alertsViewSrc = fs.readFileSync(path.join(__dirname, '../src/views/admin/alerts.ejs'), 'utf8');
const systemAlertsRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/systemAlertsRepo.js'),
  'utf8'
);
const adminAlertBannerSrc = fs.readFileSync(
  path.join(__dirname, '../src/middleware/adminAlertBanner.js'),
  'utf8'
);
const adminAlertDisplaySrc = fs.readFileSync(
  path.join(__dirname, '../src/lib/adminAlertDisplay.js'),
  'utf8'
);

test('Test 1 — open critical alert: red admin banner with count and link to /admin/alerts', () => {
  assert.match(adminLayoutSrc, /admin-critical-banner/);
  assert.match(adminLayoutSrc, /openCriticalAlertCount > 0/);
  assert.match(adminLayoutSrc, /href="\/admin\/alerts"/);
  assert.match(adminLayoutSrc, /openCriticalAlertCount === 1/);
  assert.match(adminLayoutSrc, /nevyriešen/);
  assert.match(adminLayoutSrc, /kritick/);

  assert.match(adminAlertBannerSrc, /getOpenCriticalCount/);
  assert.match(adminAlertBannerSrc, /adminLoggedIn === true/);
  assert.match(adminAlertBannerSrc, /openCriticalAlertCount/);

  assert.match(systemAlertsRepoSrc, /async function getOpenCriticalCount/);
  assert.match(systemAlertsRepoSrc, /severity = 'critical' AND status IN \('open', 'acknowledged'\)/);

  assert.match(adminRoutesSrc, /adminAlertBanner/);
  assert.match(adminRoutesSrc, /router\.use\(adminAlertBanner\)/);
});

test('Test 1b — banner counts open and acknowledged critical alerts, not resolved', () => {
  const countBlock = systemAlertsRepoSrc.slice(
    systemAlertsRepoSrc.indexOf('async function getOpenCriticalCount'),
    systemAlertsRepoSrc.indexOf('async function getAlerts')
  );
  assert.match(countBlock, /status IN \('open', 'acknowledged'\)/);
  assert.doesNotMatch(countBlock, /status = 'resolved'/);
});

test('Test 2 — acknowledge: open → acknowledged with acknowledged_at', () => {
  assert.match(systemAlertsRepoSrc, /async function acknowledgeAlert/);
  assert.match(systemAlertsRepoSrc, /status = 'acknowledged'/);
  assert.match(systemAlertsRepoSrc, /acknowledged_at = CURRENT_TIMESTAMP\(3\)/);
  assert.match(systemAlertsRepoSrc, /AND status = 'open'/);

  assert.match(adminRoutesSrc, /\/alerts\/:id\/acknowledge/);
  assert.match(adminRoutesSrc, /acknowledgeAlert\(id\)/);
  assert.match(adminRoutesSrc, /system_alert_acknowledged/);

  assert.match(alertsViewSrc, /canAcknowledge/);
  assert.match(alertsViewSrc, /\/acknowledge/);
});

test('Test 3 — resolve: open or acknowledged → resolved with resolved_at', () => {
  assert.match(systemAlertsRepoSrc, /async function resolveAlert/);
  assert.match(systemAlertsRepoSrc, /status = 'resolved'/);
  assert.match(systemAlertsRepoSrc, /resolved_at = CURRENT_TIMESTAMP\(3\)/);
  assert.match(systemAlertsRepoSrc, /status IN \('open', 'acknowledged'\)/);

  assert.match(adminRoutesSrc, /\/alerts\/:id\/resolve/);
  assert.match(adminRoutesSrc, /resolveAlert\(id\)/);
  assert.match(adminRoutesSrc, /system_alert_resolved/);

  assert.match(alertsViewSrc, /canResolve/);
  assert.match(alertsViewSrc, /\/resolve/);
});

test('Test 4 — unknown alert type: displayed generically without hardcoded type names', () => {
  assert.match(alertsViewSrc, /row\.type/);
  assert.doesNotMatch(alertsViewSrc, /billing_document_creation_failed/);
  assert.doesNotMatch(alertsViewSrc, /reservation_confirmation_email_failed/);
  assert.doesNotMatch(adminAlertDisplaySrc, /billing_document/);
  assert.doesNotMatch(adminAlertDisplaySrc, /reservation_confirmation/);

  assert.match(adminRoutesSrc, /getAlerts\(\)/);
  assert.match(adminRoutesSrc, /mapAdminAlertRow/);
});

test('alerts list page is protected and sorted by created_at DESC', () => {
  assert.match(adminRoutesSrc, /router\.get\('\/alerts', requireAdmin/);
  assert.match(systemAlertsRepoSrc, /ORDER BY created_at DESC/);
});

test('alerts list shows required fields and formatted metadata JSON', () => {
  assert.match(alertsViewSrc, /row\.severity/);
  assert.match(alertsViewSrc, /row\.status/);
  assert.match(alertsViewSrc, /row\.title/);
  assert.match(alertsViewSrc, /row\.entity_type/);
  assert.match(alertsViewSrc, /row\.entity_id/);
  assert.match(alertsViewSrc, /row\.createdAtLabel/);
  assert.match(alertsViewSrc, /row\.updatedAtLabel/);
  assert.match(alertsViewSrc, /row\.metadataFormatted/);

  assert.match(adminAlertDisplaySrc, /formatMetadataJson/);
  assert.match(adminAlertDisplaySrc, /JSON\.stringify\(parsed, null, 2\)/);
});
