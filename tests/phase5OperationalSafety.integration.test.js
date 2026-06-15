/**
 * Phase 5 integration checks — runs against local DB when configured.
 * Skips automatically when DB is unavailable.
 *
 * Run: node --test tests/phase5OperationalSafety.integration.test.js
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { getPool, close } = require('../src/db');
const systemSettingsRepo = require('../src/db/repositories/systemSettingsRepo');
const systemAlertsRepo = require('../src/db/repositories/systemAlertsRepo');
const cronHealthService = require('../src/services/cronHealthService');
const {
  ALERT_TYPES,
  createStripePaymentNeedsReconciliation,
  resolveCronNotRunning,
} = require('../src/services/systemAlertService');
const {
  detectLocalPaymentIssue,
  evaluateLocalPaymentIssue,
} = require('../src/services/stripeReconciliationService');

async function dbAvailable() {
  const pool = getPool();
  if (!pool) return false;
  try {
    await pool.execute('SELECT 1');
    const [tables] = await pool.execute(
      `SELECT TABLE_NAME FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME IN ('system_settings', 'system_alerts', 'payments', 'reservations')`
    );
    return tables.length >= 4;
  } catch {
    return false;
  }
}

async function resolveAlertsByType(type) {
  const pool = getPool();
  const [rows] = await pool.execute(
    `SELECT id FROM system_alerts WHERE type = ? AND status IN ('open', 'acknowledged')`,
    [type]
  );
  for (const row of rows) {
    await systemAlertsRepo.resolveAlert(row.id);
  }
}

test('integration: cron stopped → checkCronHealth creates cron_not_running', async (t) => {
  if (!(await dbAvailable())) {
    return t.skip('DB not configured');
  }

  const oldIso = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
  await systemSettingsRepo.setValue(cronHealthService.LAST_SUCCESS_KEY, oldIso);
  await resolveAlertsByType(ALERT_TYPES.CRON_NOT_RUNNING);

  const result = await cronHealthService.checkCronHealth();
  assert.equal(result.stale, true);
  assert.equal(result.alerted, true);

  const alert = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CRON_NOT_RUNNING);
  assert.ok(alert, 'cron_not_running alert should exist after stale check');

  await resolveCronNotRunning();
  const after = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CRON_NOT_RUNNING);
  assert.equal(after, null, 'alert should resolve after successful cron semantics');

  await cronHealthService.recordSuccessfulCronRun();
});

test('integration: first cron run with unset last_successful_cron_run_at is healthy', async (t) => {
  if (!(await dbAvailable())) {
    return t.skip('DB not configured');
  }

  const pool = getPool();
  await pool.execute('DELETE FROM system_settings WHERE setting_key = ?', [
    cronHealthService.LAST_SUCCESS_KEY,
  ]);
  await resolveAlertsByType(ALERT_TYPES.CRON_NOT_RUNNING);

  const result = await cronHealthService.checkCronHealth();
  assert.equal(result.healthy, true);
  assert.equal(result.stale, false);
  assert.equal(result.lastRunAt, null);

  const alert = await systemAlertsRepo.findUnresolvedByType(ALERT_TYPES.CRON_NOT_RUNNING);
  assert.equal(alert, null);
});

test('integration: completed payment without confirmation task → reconciliation alert', async (t) => {
  if (!(await dbAvailable())) {
    return t.skip('DB not configured');
  }

  const pool = getPool();
  const suffix = `phase5_${Date.now()}`;
  const sessionRef = `cs_test_${suffix}`;
  let slotId;
  let reservationId;
  let paymentId;

  try {
    const [slotRes] = await pool.execute(
      `INSERT INTO slots (local_date, grid_index, start_at_utc, end_at_utc, status)
       VALUES (CURDATE() + INTERVAL 7 DAY, 0, UTC_TIMESTAMP() + INTERVAL 7 DAY, UTC_TIMESTAMP() + INTERVAL 7 DAY + INTERVAL 1 HOUR, 'open')`
    );
    slotId = slotRes.insertId;

    const [resRes] = await pool.execute(
      `INSERT INTO reservations (slot_id, email, billing_name, status, payment_type)
       VALUES (?, ?, 'Test User', 'confirmed', 'deposit')`,
      [slotId, `phase5-${suffix}@example.com`]
    );
    reservationId = resRes.insertId;

    const [payRes] = await pool.execute(
      `INSERT INTO payments (reservation_id, slot_id, provider, provider_ref, payment_type, amount_cents, status, paid_at, checkout_expires_at)
       VALUES (?, ?, 'stripe', ?, 'deposit', 1500, 'completed', NOW(3), NOW(3) + INTERVAL 1 DAY)`,
      [reservationId, slotId, sessionRef]
    );
    paymentId = payRes.insertId;

    const [payRow] = await pool.execute(
      `SELECT p.id, p.provider_ref, p.reservation_id, p.amount_cents, p.currency, p.paid_at,
              r.status AS reservation_status, r.email AS reservation_email
       FROM payments p
       LEFT JOIN reservations r ON r.id = p.reservation_id
       WHERE p.id = ?`,
      [paymentId]
    );

    const issue = await detectLocalPaymentIssue(payRow[0]);
    assert.equal(issue?.failureReason, 'missing_confirmation_email_task');

    await resolveAlertsByType(ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION);
    const alertId = await createStripePaymentNeedsReconciliation({
      failureReason: issue.failureReason,
      stripeSessionId: sessionRef,
      paymentId,
      customerEmail: payRow[0].reservation_email,
      amountCents: payRow[0].amount_cents,
      currency: payRow[0].currency,
      paymentTimestamp: payRow[0].paid_at,
      reservationId,
    });
    assert.ok(alertId);

    const alert = await systemAlertsRepo.findUnresolvedByTypeAndEntity(
      ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
      'payment',
      paymentId
    );
    assert.ok(alert);
    assert.match(alert.message, /manuálne/);
  } finally {
    if (paymentId) {
      await resolveAlertsByType(ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION);
      await pool.execute('DELETE FROM payments WHERE id = ?', [paymentId]);
    }
    if (reservationId) {
      await pool.execute('DELETE FROM reservations WHERE id = ?', [reservationId]);
    }
    if (slotId) {
      await pool.execute('DELETE FROM slots WHERE id = ?', [slotId]);
    }
  }
});

test('integration: Stripe session missing locally → reconciliation alert (Case A path)', async (t) => {
  if (!(await dbAvailable())) {
    return t.skip('DB not configured');
  }

  const sessionId = `cs_test_missing_${Date.now()}`;
  await resolveAlertsByType(ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION);

  const alertId = await createStripePaymentNeedsReconciliation({
    failureReason: 'missing_local_payment',
    stripeSessionId: sessionId,
    paymentId: null,
    customerEmail: 'missing@example.com',
    amountCents: 8500,
    currency: 'eur',
    paymentTimestamp: new Date(),
    reservationId: null,
  });
  assert.ok(alertId);

  const alert = await systemAlertsRepo.findUnresolvedByTypeAndStripeSessionId(
    ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION,
    sessionId
  );
  assert.ok(alert);
  const meta =
    typeof alert.metadata_json === 'string'
      ? JSON.parse(alert.metadata_json)
      : alert.metadata_json;
  assert.equal(meta.failureReason, 'missing_local_payment');
  assert.equal(meta.stripeSessionId, sessionId);

  await resolveAlertsByType(ALERT_TYPES.STRIPE_PAYMENT_NEEDS_RECONCILIATION);
});

test('integration: full upfront payment uses payments.payment_type session in Case B', async (t) => {
  assert.equal(
    evaluateLocalPaymentIssue(
      { reservation_id: 1, reservation_status: 'confirmed' },
      null
    )?.failureReason,
    'missing_confirmation_email_task'
  );

  const paymentsRepoSrc = require('fs').readFileSync(
    require('path').join(__dirname, '../src/db/repositories/paymentsRepo.js'),
    'utf8'
  );
  assert.match(paymentsRepoSrc, /payment_type IN \('deposit', 'session'\)/);
  assert.match(paymentsRepoSrc, /full upfront checkout/);
});

test.after(async () => {
  await close();
});
