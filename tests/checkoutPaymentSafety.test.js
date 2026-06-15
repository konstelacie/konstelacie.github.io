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
