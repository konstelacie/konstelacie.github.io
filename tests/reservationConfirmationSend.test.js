const test = require('node:test');
const assert = require('node:assert/strict');
const emailProvider = require('../src/email/provider');
const emailSentLogRepo = require('../src/db/repositories/emailSentLogRepo');
const emailService = require('../src/services/emailService');

const SLOT = {
  start_at_utc: new Date('2026-06-15T08:00:00.000Z'),
  end_at_utc: new Date('2026-06-15T09:00:00.000Z'),
  timezone: 'Europe/Bratislava',
};

const stubs = {
  sendEmail: emailProvider.sendEmail,
  log: emailSentLogRepo.log,
};

test.afterEach(() => {
  emailProvider.sendEmail = stubs.sendEmail;
  emailSentLogRepo.log = stubs.log;
});

function mockSendCapture() {
  const captured = {};
  emailProvider.sendEmail = async (to, subject, html) => {
    captured.to = to;
    captured.subject = subject;
    captured.html = html;
    return { ok: true, messageId: 'msg-test-1' };
  };
  emailSentLogRepo.log = async (row) => {
    captured.log = row;
  };
  return captured;
}

test('admin resend: subject and body show resend copy; log uses reservation-confirmation-resend', async () => {
  const captured = mockSendCapture();

  await emailService.sendReservationConfirmation(
    {
      to: 'user@example.com',
      slot: SLOT,
      amountCents: 1500,
      bookingPaymentType: 'deposit',
      resend: true,
      showAsResend: true,
    },
    { entity_type: 'reservation', entity_id: 42, actorType: 'admin' }
  );

  assert.equal(captured.subject, 'Rezervácia je potvrdená (znova)');
  assert.match(captured.html, /Posielame ti znova potvrdenie rezervácie/);
  assert.match(captured.html, /Rezervácia je potvrdená \(znova\)/);
  assert.equal(captured.log.templateId, 'reservation-confirmation-resend');
  assert.equal(captured.log.actorType, 'admin');
});

test('bounce/failed fix: subject and body match first send; log still reservation-confirmation-resend', async () => {
  const captured = mockSendCapture();

  await emailService.sendReservationConfirmation(
    {
      to: 'fixed@example.com',
      slot: SLOT,
      amountCents: 1500,
      bookingPaymentType: 'deposit',
      resend: true,
      showAsResend: false,
    },
    { entity_type: 'reservation', entity_id: 7, actorType: 'system' }
  );

  assert.equal(captured.subject, 'Rezervácia je potvrdená');
  assert.match(captured.html, /rezerváciu Ti môžem potvrdiť/);
  assert.doesNotMatch(captured.subject, /\(znova\)/);
  assert.doesNotMatch(captured.html, /Posielame ti znova potvrdenie rezervácie/);
  assert.equal(captured.log.templateId, 'reservation-confirmation-resend');
});

test('initial dispatch: no resend flags — first-send subject, body, and log template', async () => {
  const captured = mockSendCapture();

  await emailService.sendReservationConfirmation(
    {
      to: 'new@example.com',
      slot: SLOT,
      amountCents: 9900,
      bookingPaymentType: 'full',
    },
    { entity_type: 'reservation', entity_id: 1 }
  );

  assert.equal(captured.subject, 'Platba je dokončená — rezervácia potvrdená');
  assert.match(captured.html, /Tvoja platba prebehla v poriadku/);
  assert.doesNotMatch(captured.subject, /\(znova\)/);
  assert.doesNotMatch(captured.html, /Posielame ti znova potvrdenie rezervácie/);
  assert.equal(captured.log.templateId, 'reservation-confirmation');
});

test('admin full-payment resend includes (znova) in subject', async () => {
  const captured = mockSendCapture();

  await emailService.sendReservationConfirmation(
    {
      to: 'user@example.com',
      slot: SLOT,
      amountCents: 9900,
      bookingPaymentType: 'full',
      resend: true,
      showAsResend: true,
    },
    { entity_type: 'reservation', entity_id: 99, actorType: 'admin' }
  );

  assert.equal(captured.subject, 'Platba je dokončená — rezervácia potvrdená (znova)');
  assert.match(captured.html, /Posielame ti znova potvrdenie rezervácie/);
});
