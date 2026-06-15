const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const billingDeliveryServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/billingDeliveryService.js'),
  'utf8'
);
const billingDeliverStuckSrc = fs.readFileSync(
  path.join(__dirname, '../src/jobs/billingDeliverStuck.js'),
  'utf8'
);
const billingDocumentsRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/billingDocumentsRepo.js'),
  'utf8'
);
const systemAlertServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/systemAlertService.js'),
  'utf8'
);
const emailDeliveryTaskServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/emailDeliveryTaskService.js'),
  'utf8'
);
const emailDeliveryTasksRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/emailDeliveryTasksRepo.js'),
  'utf8'
);
const emailServiceSrc = fs.readFileSync(
  path.join(__dirname, '../src/services/emailService.js'),
  'utf8'
);
const krosWebhookSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/kros.js'), 'utf8');
const configSrc = fs.readFileSync(path.join(__dirname, '../src/config/index.js'), 'utf8');

test('Test 1 — KROS normal path: webhook handler unchanged; no stuck fallback in cron', () => {
  assert.match(krosWebhookSrc, /kros_webhook_received_at = NOW\(3\)/);
  assert.match(krosWebhookSrc, /sendBillingInvoiceKrosEmail/);
  assert.doesNotMatch(billingDeliverStuckSrc, /forceInternal/);
  assert.doesNotMatch(billingDeliveryServiceSrc, /kros_fallback_delivery/);
  assert.doesNotMatch(billingDeliveryServiceSrc, /processBillingDocumentDelivery\(id, \{ forceInternal: true \}\)/);
});

test('Test 2 — KROS stuck: alert + optional billing-delayed; no legacy CT-PDF fallback', () => {
  assert.match(billingDocumentsRepoSrc, /findStuckKrosAcceptedWithoutWebhook/);
  assert.match(billingDocumentsRepoSrc, /kros_status = 'accepted'/);
  assert.match(billingDocumentsRepoSrc, /kros_webhook_received_at IS NULL/);
  assert.match(billingDocumentsRepoSrc, /email_sent_at IS NULL/);

  assert.match(billingDeliveryServiceSrc, /processStuckKrosWebhookMissingBatch/);
  assert.match(billingDeliveryServiceSrc, /createKrosWebhookMissing/);
  assert.match(billingDeliveryServiceSrc, /insertBillingDelayedTask/);
  assert.doesNotMatch(billingDeliveryServiceSrc, /processStuckKrosAcceptedFallbackBatch/);
  assert.doesNotMatch(billingDeliveryServiceSrc, /forceInternal: true/);

  const { ALERT_TYPES } = require('../src/services/systemAlertService');
  assert.equal(ALERT_TYPES.KROS_WEBHOOK_MISSING, 'kros_webhook_missing');
  assert.match(systemAlertServiceSrc, /KROS webhook neprišiel/);
  assert.match(systemAlertServiceSrc, /entityType: 'billing_document'/);

  assert.match(emailDeliveryTasksRepoSrc, /BILLING_DELAYED_TEMPLATE = 'billing-delayed'/);
  assert.match(emailDeliveryTasksRepoSrc, /ENTITY_TYPE_BILLING_DOCUMENT = 'billing_document'/);
  assert.match(emailServiceSrc, /sendBillingDelayedEmail/);
  assert.match(emailServiceSrc, /billing-delayed\.ejs/);
  assert.match(emailServiceSrc, /Doklad k platbe pošleme dodatočne/);
});

test('Test 3 — cron idempotency: unresolved alert check and unique billing-delayed task', () => {
  assert.match(systemAlertServiceSrc, /findUnresolvedByTypeAndEntity/);
  assert.match(emailDeliveryTasksRepoSrc, /ER_DUP_ENTRY/);
  assert.match(emailDeliveryTasksRepoSrc, /findByTemplateEntity/);
  assert.match(billingDeliveryServiceSrc, /wasAlreadySent\('billing-delayed'/);
  assert.match(emailDeliveryTaskServiceSrc, /wasAlreadySent/);
  assert.match(billingDeliverStuckSrc, /processStuckKrosWebhookMissingBatch/);
});

test('Test 4 — already delivered invoice: skip when invoice emails or email_sent_at set', () => {
  const batchBlock = billingDeliveryServiceSrc.slice(
    billingDeliveryServiceSrc.indexOf('async function processStuckKrosWebhookMissingBatch'),
    billingDeliveryServiceSrc.indexOf('module.exports = {')
  );

  assert.match(batchBlock, /billing-invoice-kros/);
  assert.match(batchBlock, /billing-invoice/);
  assert.match(batchBlock, /row\.email_sent_at/);
  assert.match(batchBlock, /skipped \+= 1/);
});

test('Test 5 — KROS failed state: stuck query only matches accepted', () => {
  const queryBlock = billingDocumentsRepoSrc.slice(
    billingDocumentsRepoSrc.indexOf('async function findStuckKrosAcceptedWithoutWebhook'),
    billingDocumentsRepoSrc.indexOf('module.exports = {')
  );
  assert.match(queryBlock, /kros_status = 'accepted'/);
  assert.doesNotMatch(queryBlock, /kros_status = 'failed'/);
});

test('Test 6 — billing delayed is secondary to reservation confirmation', () => {
  assert.match(billingDeliveryServiceSrc, /isEligibleForBillingDelayedEmail/);
  assert.match(billingDeliveryServiceSrc, /reservation-confirmation/);
  assert.match(billingDeliveryServiceSrc, /status === 'confirmed'/);
  assert.match(emailDeliveryTaskServiceSrc, /sendBillingDelayedEmail/);
  assert.match(emailDeliveryTaskServiceSrc, /RESERVATION_CONFIRMATION_TEMPLATE/);
  assert.match(emailDeliveryTaskServiceSrc, /BILLING_DELAYED_TEMPLATE/);
});

test('cron job exposes Phase 4 result fields', () => {
  assert.match(billingDeliverStuckSrc, /alerted/);
  assert.match(billingDeliverStuckSrc, /delayedEmailsQueued/);
  assert.match(billingDeliverStuckSrc, /delayedEmailsSent/);
  assert.match(billingDeliverStuckSrc, /skipped/);
  assert.match(billingDeliverStuckSrc, /errors/);
});

test('config exposes stuck threshold and billing delayed email flag', () => {
  assert.match(configSrc, /stuckThresholdMinutes/);
  assert.match(configSrc, /KROS_STUCK_THRESHOLD_MINUTES/);
  assert.match(configSrc, /delayedEmailEnabled/);
  assert.match(configSrc, /BILLING_DELAYED_EMAIL_ENABLED/);
});

test('billing-delayed dispatch uses billing_document entity', () => {
  assert.match(emailDeliveryTaskServiceSrc, /BILLING_DELAYED_TEMPLATE/);
  assert.match(emailDeliveryTaskServiceSrc, /ENTITY_TYPE_BILLING_DOCUMENT/);
});
