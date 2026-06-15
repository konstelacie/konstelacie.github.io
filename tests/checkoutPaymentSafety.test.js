const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const stripeWebhookPath = path.join(__dirname, '../src/routes/api/stripe.js');
const stripeWebhookSrc = fs.readFileSync(stripeWebhookPath, 'utf8');

test('checkout webhook keeps billing out of the critical transaction', () => {
  assert.equal(stripeWebhookSrc.includes('insertBillingDocumentForCompletedPayment'), false);
  assert.equal(stripeWebhookSrc.includes('checkoutPostCommitService'), true);
  assert.equal(stripeWebhookSrc.includes('INSERT INTO webhook_events'), true);
});

test('checkout webhook does not mark captured Stripe payment as failed', () => {
  assert.equal(stripeWebhookSrc.includes("UPDATE payments SET status = ? WHERE provider_ref = ?"), false);
  assert.equal(stripeWebhookSrc.includes("['failed', session.id]"), false);
});

test('system alert types include billing document creation failure', () => {
  const { ALERT_TYPES } = require('../src/services/systemAlertService');
  assert.equal(ALERT_TYPES.BILLING_DOCUMENT_CREATION_FAILED, 'billing_document_creation_failed');
});

const checkoutPostCommitPath = path.join(__dirname, '../src/services/checkoutPostCommitService.js');
const checkoutPostCommitSrc = fs.readFileSync(checkoutPostCommitPath, 'utf8');

test('duplicate billing recovery skips delivery and KROS when document already exists', () => {
  assert.match(checkoutPostCommitSrc, /if\s*\(\s*billingCreated\s*\)/);
  assert.match(checkoutPostCommitSrc, /tag:\s*'billing_document_already_exists'/);
  assert.match(
    checkoutPostCommitSrc,
    /startBillingDelivery\(billingDocumentId\)[\s\S]*startKrosSync\(billingDocumentId, paymentBackendName\)/
  );

  const billingCreatedBlock = checkoutPostCommitSrc.slice(
    checkoutPostCommitSrc.indexOf('if (billingCreated)'),
    checkoutPostCommitSrc.indexOf("tag: 'billing_document_already_exists'")
  );
  assert.match(billingCreatedBlock, /startBillingDelivery\(billingDocumentId\)/);
  assert.match(billingCreatedBlock, /startKrosSync\(billingDocumentId, paymentBackendName\)/);

  const alreadyExistsBlock = checkoutPostCommitSrc.slice(
    checkoutPostCommitSrc.indexOf("tag: 'billing_document_already_exists'"),
    checkoutPostCommitSrc.indexOf('} catch (err)')
  );
  assert.equal(alreadyExistsBlock.includes('startBillingDelivery'), false);
  assert.equal(alreadyExistsBlock.includes('startKrosSync'), false);
});
