const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const recoverySrc = fs.readFileSync(
  path.join(__dirname, '../src/services/reservationConfirmationRecoveryService.js'),
  'utf8'
);
const paymentsSrc = fs.readFileSync(path.join(__dirname, '../src/routes/api/payments.js'), 'utf8');
const reservationsRepoSrc = fs.readFileSync(
  path.join(__dirname, '../src/db/repositories/reservationsRepo.js'),
  'utf8'
);

test('recovery service gates on bounced or failed confirmation status', () => {
  assert.match(recoverySrc, /deliveryStatus !== 'bounced' && deliveryStatus !== 'failed'/);
  assert.match(recoverySrc, /CONFIRMATION_EMAIL_OK/);
});

test('recovery service excludes current reservation from email duplicate check', () => {
  assert.match(recoverySrc, /hasActiveReservationForEmail\(newEmail, reservation\.id\)/);
  assert.match(reservationsRepoSrc, /exceptReservationId/);
});

test('payments router exposes fix-confirmation-email endpoint', () => {
  assert.match(paymentsSrc, /\/fix-confirmation-email/);
  assert.match(paymentsSrc, /fixConfirmationEmailForCheckoutSession/);
  assert.match(paymentsSrc, /paymentFixConfirmationEmailLimiter/);
});
