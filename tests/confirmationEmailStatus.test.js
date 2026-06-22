const test = require('node:test');
const assert = require('node:assert/strict');
const {
  maskRecipientEmail,
  resolveConfirmationEmailStatus,
  buildConfirmationEmailPayload,
} = require('../src/lib/confirmationEmailStatus');

test('maskRecipientEmail masks local part', () => {
  assert.equal(maskRecipientEmail('anna@gmail.com'), 'a***@gmail.com');
});

test('resolveConfirmationEmailStatus maps complained log to bounced', () => {
  const status = resolveConfirmationEmailStatus(
    { status: 'sent', attempt_count: 1, max_attempts: 5 },
    { delivery_status: 'complained' }
  );
  assert.equal(status, 'bounced');
});

test('resolveConfirmationEmailStatus prefers latest successful send semantics via log row', () => {
  assert.equal(
    resolveConfirmationEmailStatus(
      { status: 'sent', attempt_count: 1, max_attempts: 5 },
      { delivery_status: 'accepted' }
    ),
    'sent'
  );
});

test('resolveConfirmationEmailStatus returns sent when task is null but log row exists', () => {
  assert.equal(
    resolveConfirmationEmailStatus(null, { delivery_status: 'accepted' }),
    'sent'
  );
});

test('resolveConfirmationEmailStatus returns failed when task exhausted', () => {
  assert.equal(
    resolveConfirmationEmailStatus(
      { status: 'failed', attempt_count: 5, max_attempts: 5 },
      null
    ),
    'failed'
  );
});

test('buildConfirmationEmailPayload returns null without task or log', () => {
  assert.equal(buildConfirmationEmailPayload(null, null), null);
});
