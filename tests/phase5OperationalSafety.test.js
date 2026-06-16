const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migrationSql = fs.readFileSync(
  path.join(__dirname, '../src/db/migrations/001_initial.sql'),
  'utf8'
);
const jobsIndexSrc = fs.readFileSync(path.join(__dirname, '../src/jobs/index.js'), 'utf8');
const cronHealthJobSrc = fs.readFileSync(path.join(__dirname, '../src/jobs/cronHealth.js'), 'utf8');
const stripeReconciliationJobSrc = fs.readFileSync(
  path.join(__dirname, '../src/jobs/stripeReconciliation.js'),
  'utf8'
);
const cronHealthServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/cronHealthService.js'),
  'utf8'
);
const stripeReconciliationServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/stripeReconciliationService.js'),
  'utf8'
);
const systemAlertServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/systemAlertService.js'),
  'utf8'
);
const systemAlertsRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/systemAlertsRepo.js'),
  'utf8'
);
const preSessionReminderSrc = fs.readFileSync(
  path.join(__dirname, '../src/jobs/preSessionReminder.js'),
  'utf8'
);
const sessionBeforeStartSrc = fs.readFileSync(
  path.join(__dirname, '../src/jobs/sessionBeforeStart.js'),
  'utf8'
);
const reservationsRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/reservationsRepo.js'),
  'utf8'
);

const { ALERT_TYPES, resolveCronNotRunning } = require('../src/services/systemAlertService');
const { isCronStale } = require('../src/services/cronHealthService');
const {
  evaluateLocalPaymentIssue,
  isBookingCheckoutSession,
} = require('../src/services/stripeReconciliationService');

test('schema defines system_settings for cron health tracking', () => {
  assert.match(migrationSql, /CREATE TABLE system_settings/);
  assert.match(migrationSql, /setting_key VARCHAR\(100\) NOT NULL PRIMARY KEY/);
});

test('jobs registry includes cron-health and stripe-reconciliation', () => {
  assert.match(jobsIndexSrc, /cronHealth/);
  assert.match(jobsIndexSrc, /stripeReconciliation/);
  assert.match(jobsIndexSrc, /recordSuccessfulCronRun/);
  assert.match(jobsIndexSrc, /resolveCronNotRunning/);
  assert.match(cronHealthJobSrc, /checkCronHealth/);
  assert.match(stripeReconciliationJobSrc, /runStripeReconciliation/);
});

test('system alert types include Phase 5 operational alerts', () => {
  assert.equal(ALERT_TYPES.CRON_NOT_RUNNING, 'cron_not_running');
  assert.equal(
    ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
    'stripe_payment_needs_reconciliation'
  );
  assert.equal(ALERT_TYPES.STRIPE_RECONCILIATION_FAILED, 'stripe_reconciliation_failed');
  assert.match(systemAlertServiceSrc, /createCronNotRunning/);
  assert.match(systemAlertServiceSrc, /createStripePaymentNeedsReconciliation/);
  assert.match(systemAlertServiceSrc, /createStripeReconciliationFailed/);
  assert.match(systemAlertServiceSrc, /resolveStripeReconciliationFailed/);
  assert.match(systemAlertServiceSrc, /resolveCronNotRunning/);
  assert.match(systemAlertServiceSrc, /findUnresolvedByType/);
  assert.match(systemAlertsRepoSrc, /findUnresolvedByTypeAndStripeSessionId/);
});

test('Stripe list failure creates stripe_reconciliation_failed alert', () => {
  assert.match(stripeReconciliationServiceSrc, /createStripeReconciliationFailed/);
  assert.match(stripeReconciliationServiceSrc, /detectorFailed: true/);
  assert.match(stripeReconciliationServiceSrc, /resolveStripeReconciliationFailed/);
  assert.doesNotMatch(
    stripeReconciliationServiceSrc.slice(
      stripeReconciliationServiceSrc.indexOf('} catch (err)'),
      stripeReconciliationServiceSrc.indexOf('for (const { session } of stripeSessions)')
    ),
    /setDateValue\(LAST_RUN_KEY/
  );
});

test('cron health docs describe admin-page detection and first-run behavior', () => {
  const cronDoc = fs.readFileSync(
    path.join(__dirname, '../docs/SCHEDULED-EMAILS-CRON.md'),
    'utf8'
  );
  const apiDoc = fs.readFileSync(path.join(__dirname, '../docs/API.md'), 'utf8');
  assert.match(cronDoc, /admin page load/i);
  assert.match(cronDoc, /first successful cron/i);
  assert.match(cronDoc, /last_successful_cron_run_at.*unset/i);
  assert.match(cronDoc, /payments\.payment_type.*session/);
  assert.match(cronDoc, /stripe_reconciliation_failed/);
  assert.match(apiDoc, /admin page load/i);
});

test('Test 1 — Cron healthy: recent run is not stale', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const recent = new Date('2026-06-15T11:30:00.000Z');
  assert.equal(isCronStale(recent, now, 60), false);
  assert.match(cronHealthServiceSrc, /if \(!stale\)/);
});

test('Test 2 — Cron stopped: stale last run exceeds threshold', () => {
  const now = new Date('2026-06-15T12:00:00.000Z');
  const old = new Date('2026-06-15T10:00:00.000Z');
  assert.equal(isCronStale(old, now, 60), true);
  assert.match(cronHealthServiceSrc, /createCronNotRunning/);
  assert.match(systemAlertServiceSrc, /Scheduled cron tasks have not run successfully/);
  const adminBannerSrc = fs.readFileSync(
    path.join(__dirname, '../src/middleware/adminAlertBanner.js'),
    'utf8'
  );
  assert.match(adminBannerSrc, /checkCronHealth/);
});

test('Test 3 — Cron recovered: runAll resolves cron_not_running after success', () => {
  assert.match(jobsIndexSrc, /await cronHealthService\.recordSuccessfulCronRun\(\)/);
  assert.match(jobsIndexSrc, /await systemAlertService\.resolveCronNotRunning\(\)/);
  assert.equal(typeof resolveCronNotRunning, 'function');
  assert.match(systemAlertServiceSrc, /findUnresolvedByType\(ALERT_TYPES\.CRON_NOT_RUNNING\)/);
});

test('Test 4 — Missing Stripe payment: reconciliation alerts without local completed payment', () => {
  assert.match(stripeReconciliationServiceSrc, /missing_local_payment/);
  assert.match(stripeReconciliationServiceSrc, /findByProviderRef/);
  assert.match(stripeReconciliationServiceSrc, /localPayment\.status !== 'completed'/);
  assert.match(stripeReconciliationServiceSrc, /createStripePaymentNeedsReconciliation/);
  assert.doesNotMatch(stripeReconciliationServiceSrc, /INSERT INTO reservations/);
  assert.doesNotMatch(stripeReconciliationServiceSrc, /INSERT INTO payments/);
});

test('Test 5 — Broken local payment state: reservation or confirmation email issues', () => {
  assert.equal(
    evaluateLocalPaymentIssue({ reservation_id: null, reservation_status: null }, null)?.failureReason,
    'missing_reservation'
  );
  assert.equal(
    evaluateLocalPaymentIssue(
      { reservation_id: 1, reservation_status: 'pending_payment' },
      { status: 'pending', attempt_count: 0, max_attempts: 5 }
    )?.failureReason,
    'missing_reservation'
  );
  assert.equal(
    evaluateLocalPaymentIssue(
      { reservation_id: 1, reservation_status: 'confirmed' },
      null
    )?.failureReason,
    'missing_confirmation_email_task'
  );
  assert.equal(
    evaluateLocalPaymentIssue(
      { reservation_id: 1, reservation_status: 'confirmed' },
      { status: 'failed', attempt_count: 5, max_attempts: 5 }
    )?.failureReason,
    'confirmation_email_permanently_failed'
  );
  assert.equal(
    evaluateLocalPaymentIssue(
      { reservation_id: 1, reservation_status: 'confirmed' },
      { status: 'sent', attempt_count: 1, max_attempts: 5 }
    ),
    null
  );
});

test('Test 6 — Reminder unchanged: window and idempotency preserved', () => {
  assert.match(reservationsRepoSrc, /INTERVAL '23:30' HOUR_MINUTE/);
  assert.match(reservationsRepoSrc, /INTERVAL '24:30' HOUR_MINUTE/);
  assert.match(preSessionReminderSrc, /wasAlreadySent/);
  assert.match(preSessionReminderSrc, /pre-session-reminder/);
  assert.doesNotMatch(preSessionReminderSrc, /email_delivery_tasks/);
});

test('session-before-start: retries until start, idempotent via email_sent_log', () => {
  assert.match(jobsIndexSrc, /sessionBeforeStart/);
  assert.match(reservationsRepoSrc, /findDueForSessionBeforeStartEmail/);
  assert.match(reservationsRepoSrc, /start_at_utc > NOW\(3\)/);
  assert.match(reservationsRepoSrc, /DATE_ADD\(NOW\(3\), INTERVAL \? MINUTE\)/);
  assert.match(sessionBeforeStartSrc, /wasAlreadySent/);
  assert.match(sessionBeforeStartSrc, /session-before-start/);
  assert.match(sessionBeforeStartSrc, /sessionBeforeStartMinutes/);
  assert.doesNotMatch(sessionBeforeStartSrc, /email_delivery_tasks/);
});

test('Stripe reconciliation only inspects booking checkout sessions', () => {
  assert.equal(isBookingCheckoutSession({ metadata: { slotId: '12' } }), true);
  assert.equal(isBookingCheckoutSession({ metadata: { checkoutPurpose: 'balance_topup' } }), false);
  assert.match(stripeReconciliationServiceSrc, /isBookingCheckoutSession/);
});

test('reconciliation metadata includes investigation fields', () => {
  assert.match(systemAlertServiceSrc, /stripeSessionId/);
  assert.match(systemAlertServiceSrc, /paymentId/);
  assert.match(systemAlertServiceSrc, /customerEmail/);
  assert.match(systemAlertServiceSrc, /amountCents/);
  assert.match(systemAlertServiceSrc, /paymentTimestamp/);
  assert.match(systemAlertServiceSrc, /failureReason/);
});
