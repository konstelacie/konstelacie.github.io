const crypto = require('node:crypto');
const test = require('node:test');
const assert = require('node:assert/strict');

const { verifyResendWebhook } = require('../src/routes/api/resend');
const emailSentLogRepo = require('../src/db/repositories/emailSentLogRepo');
const { getPool } = require('../src/db');

const TEST_WEBHOOK_SECRET = 'whsec_dGVzdC1yZXNlbmQtd2ViaG9vay1zZWNyZXQ=';

function signSvixPayload(secret, payload, msgId, timestamp) {
  const keyPart = secret.startsWith('whsec_') ? secret.slice(6) : secret;
  const keyBytes = Buffer.from(keyPart, 'base64');
  const toSign = `${msgId}.${timestamp}.${payload}`;
  const signature = crypto.createHmac('sha256', keyBytes).update(toSign).digest('base64');
  return `v1,${signature}`;
}

function buildSignedHeaders(secret, payload, msgId = 'msg_test_001', timestamp = '1710000000') {
  return {
    'svix-id': msgId,
    'svix-timestamp': timestamp,
    'svix-signature': signSvixPayload(secret, payload, msgId, timestamp),
  };
}

const bounceFixture = {
  type: 'email.bounced',
  created_at: '2026-01-15T12:00:00.000Z',
  data: {
    email_id: '56761188-7520-42d8-8898-ff6fc54ce618',
    from: 'citimtedasom.sk <noreply@citimtedasom.sk>',
    to: ['typo@gmial.com'],
    subject: 'Rezervácia je potvrdená',
    bounce: {
      message: "The recipient's email address is on the suppression list.",
      subType: 'Suppressed',
      type: 'Permanent',
    },
  },
};

test('verifyResendWebhook accepts valid Svix signature', () => {
  const payload = JSON.stringify(bounceFixture);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers = buildSignedHeaders(TEST_WEBHOOK_SECRET, payload, 'msg_test_001', timestamp);
  const event = verifyResendWebhook(Buffer.from(payload, 'utf8'), headers, TEST_WEBHOOK_SECRET);
  assert.equal(event.type, 'email.bounced');
  assert.equal(event.data.email_id, bounceFixture.data.email_id);
});

test('verifyResendWebhook rejects invalid signature', () => {
  const payload = JSON.stringify(bounceFixture);
  const headers = buildSignedHeaders(TEST_WEBHOOK_SECRET, payload);
  headers['svix-signature'] = 'v1,invalidsignaturevalueAAAAAAAAAAAAAAAAAAAAAA=';
  const event = verifyResendWebhook(Buffer.from(payload, 'utf8'), headers, TEST_WEBHOOK_SECRET);
  assert.equal(event, null);
});

test('bounce fixture has expected Resend shape', () => {
  assert.equal(bounceFixture.type, 'email.bounced');
  assert.ok(bounceFixture.data.email_id);
  assert.ok(bounceFixture.data.bounce?.message);
});

async function dbAvailable() {
  const pool = getPool();
  if (!pool) return false;
  try {
    const [cols] = await pool.execute(
      `SELECT COLUMN_NAME FROM information_schema.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE()
         AND TABLE_NAME = 'email_sent_log'
         AND COLUMN_NAME = 'delivery_status'`
    );
    return cols.length === 1;
  } catch {
    return false;
  }
}

test('markBounced is idempotent for the same provider message id', async (t) => {
  if (!(await dbAvailable())) {
    return t.skip('DB not configured or schema not migrated');
  }

  const pool = getPool();
  const messageId = `test-bounce-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

  await pool.execute(
    `INSERT INTO email_sent_log
       (recipient_email, template_id, entity_type, entity_id, provider_message_id, delivery_status)
     VALUES (?, ?, ?, ?, ?, 'accepted')`,
    ['bounce-test@example.com', 'reservation-confirmation', 'reservation', 999999001, messageId]
  );

  try {
    const first = await emailSentLogRepo.markBounced(messageId, {
      status: 'bounced',
      reason: 'first reason',
    });
    assert.equal(first.updated, true);
    assert.equal(first.row?.delivery_status, 'bounced');
    assert.equal(first.row?.bounce_reason, 'first reason');
    const bouncedAtFirst = first.row?.bounced_at;

    const second = await emailSentLogRepo.markBounced(messageId, {
      status: 'bounced',
      reason: 'second reason should be ignored',
    });
    assert.equal(second.updated, false);
    assert.equal(second.row?.delivery_status, 'bounced');
    assert.equal(second.row?.bounce_reason, 'first reason');
    assert.deepEqual(second.row?.bounced_at, bouncedAtFirst);
  } finally {
    await pool.execute('DELETE FROM email_sent_log WHERE provider_message_id = ?', [messageId]);
  }
});
