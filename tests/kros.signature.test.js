const test = require('node:test');
const assert = require('node:assert/strict');
const { verifyKrosSignature } = require('../src/routes/api/kros');

test('verifyKrosSignature validates known UTF-16LE HMAC vector', () => {
  const payload =
    '{"status":200,"externalId":"11111111-2222-3333-4444-555555555555","data":{"documentId":"FA-2026-1"}}';
  const secret = 'kros-secret-123';
  const expectedSignature = 'yayIOBK9RX322/ixT69BXcFVbhiT9w4Q1LBY8nudmk0=';

  const ok = verifyKrosSignature(Buffer.from(payload, 'utf8'), expectedSignature, secret);
  assert.equal(ok, true);
});

test('verifyKrosSignature rejects mismatched signature', () => {
  const payload = '{"status":200,"externalId":"abc"}';
  const secret = 'kros-secret-123';
  const badSignature = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

  const ok = verifyKrosSignature(Buffer.from(payload, 'utf8'), badSignature, secret);
  assert.equal(ok, false);
});
