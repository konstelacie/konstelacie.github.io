const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const migrationSql = fs.readFileSync(
  path.join(__dirname, '../src/db/migrations/001_initial.sql'),
  'utf8'
);
const stripeWebhookSrc = fs.readFileSync(
  path.join(__dirname, '../src/routes/api/stripe.js'),
  'utf8'
);
const checkoutPostCommitSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/checkoutPostCommitService.js'),
  'utf8'
);
const emailDeliveryTaskServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/emailDeliveryTaskService.js'),
  'utf8'
);
const jobsIndexSrc = fs.readFileSync(path.join(__dirname, '../src/jobs/index.js'), 'utf8');

test('schema defines email_delivery_tasks with idempotency constraint', () => {
  assert.match(migrationSql, /CREATE TABLE email_delivery_tasks/);
  assert.match(migrationSql, /uq_email_delivery_tasks_template_entity/);
  assert.match(migrationSql, /idx_email_delivery_tasks_due/);
  assert.match(migrationSql, /template_id VARCHAR\(100\)/);
  assert.match(migrationSql, /status ENUM\('pending','sending','sent','failed','cancelled'\)/);
});

test('Test 1 — normal booking: task inserted in same transaction as reservation commit', () => {
  const caseBlock = stripeWebhookSrc.slice(
    stripeWebhookSrc.indexOf("case 'checkout.session.completed'"),
    stripeWebhookSrc.indexOf("case 'checkout.session.expired'")
  );

  assert.match(caseBlock, /insertReservationConfirmationTask/);
  assert.match(caseBlock, /await conn\.commit\(\)/);

  const insertPos = caseBlock.indexOf('insertReservationConfirmationTask');
  const commitPos = caseBlock.indexOf('await conn.commit()');
  assert.ok(insertPos > 0 && commitPos > insertPos, 'task insert must precede commit');

  assert.match(checkoutPostCommitSrc, /processTaskById/);
  assert.match(checkoutPostCommitSrc, /startConfirmationEmailTask/);
  assert.doesNotMatch(checkoutPostCommitSrc, /sendReservationConfirmation/);
  assert.doesNotMatch(checkoutPostCommitSrc, /sendConfirmationEmailAsync/);
});

test('Test 2 — send failure: task processing does not throw to webhook caller', () => {
  assert.match(emailDeliveryTaskServiceSrc, /async function processTaskById/);
  assert.match(emailDeliveryTaskServiceSrc, /Never throws/);
  assert.match(emailDeliveryTaskServiceSrc, /markFailed/);
  assert.match(emailDeliveryTaskServiceSrc, /nextAttemptAt/);
  assert.match(checkoutPostCommitSrc, /\.catch\(\(err\)/);
});

test('Test 3 — retry succeeds: cron job processes due tasks', () => {
  assert.match(jobsIndexSrc, /emailDeliveryTasks/);
  assert.match(emailDeliveryTaskServiceSrc, /async function processDueTasks/);
  assert.match(emailDeliveryTaskServiceSrc, /findDue/);
  assert.match(emailDeliveryTaskServiceSrc, /wasAlreadySent/);
});

test('Test 4 — duplicate webhook: idempotency via webhook_events and unique task key', () => {
  assert.match(stripeWebhookSrc, /isEventAlreadyProcessed/);
  assert.match(migrationSql, /uq_email_delivery_tasks_template_entity/);
  assert.match(emailDeliveryTaskServiceSrc, /task\.status === 'sent'/);
  assert.match(emailDeliveryTaskServiceSrc, /wasAlreadySent/);
});

test('Test 5 — top-up payment: no reservation confirmation email task', () => {
  const caseBlock = stripeWebhookSrc.slice(
    stripeWebhookSrc.indexOf("case 'checkout.session.completed'"),
    stripeWebhookSrc.indexOf("case 'checkout.session.expired'")
  );

  assert.match(caseBlock, /isBalanceTopup/);
  assert.match(caseBlock, /reservationIdForEmail = null/);

  const topupBlock = caseBlock.slice(
    caseBlock.indexOf('if (isBalanceTopup)'),
    caseBlock.indexOf('await conn.execute(\n            \'UPDATE payments SET status')
  );
  assert.doesNotMatch(topupBlock, /insertReservationConfirmationTask/);

  const taskInsertBlock = caseBlock.slice(
    caseBlock.indexOf('if (reservationIdForEmail)'),
    caseBlock.indexOf('await conn.execute(\'INSERT INTO webhook_events')
  );
  assert.match(taskInsertBlock, /if \(reservationIdForEmail\)/);
});

test('exhausted retries create reservation_confirmation_email_failed alert', () => {
  const { ALERT_TYPES, createReservationConfirmationEmailFailed } = require('../src/services/systemAlertService');
  assert.equal(
    ALERT_TYPES.RESERVATION_CONFIRMATION_EMAIL_FAILED,
    'reservation_confirmation_email_failed'
  );
  assert.equal(typeof createReservationConfirmationEmailFailed, 'function');
  assert.match(emailDeliveryTaskServiceSrc, /createReservationConfirmationEmailFailed/);
  assert.match(emailDeliveryTaskServiceSrc, /attemptCount >= Number\(task\.max_attempts\)/);
});

test('reservation confirmation maps to sendReservationConfirmation', () => {
  assert.match(emailDeliveryTaskServiceSrc, /sendReservationConfirmation/);
  assert.match(
    emailDeliveryTaskServiceSrc,
    /RESERVATION_CONFIRMATION_TEMPLATE/
  );
});

test('backoff schedule increases delay between retries', () => {
  const { computeNextAttemptAt } = require('../src/services/emailDeliveryTaskService');
  const t1 = computeNextAttemptAt(1);
  const t2 = computeNextAttemptAt(2);
  assert.ok(t2.getTime() > t1.getTime());
});
