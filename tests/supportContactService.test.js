const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../src/middleware/apiError');
const reservationsRepo = require('../src/db/repositories/reservationsRepo');
const paymentsRepo = require('../src/db/repositories/paymentsRepo');
const emailProvider = require('../src/email/provider');
const {
  sendSupportContact,
  resolveReservationIdForEmail,
  resolveCheckoutSessionIdForEmail,
  validateMessage,
  validatePhone,
  validateCheckoutSessionId,
  buildSupportEmailSubject,
  buildSupportEmailHtml,
} = require('../src/services/supportContactService');

const repoStubs = {
  getById: reservationsRepo.getById,
  findByProviderRef: paymentsRepo.findByProviderRef,
  sendEmail: emailProvider.sendEmail,
};

test.afterEach(() => {
  reservationsRepo.getById = repoStubs.getById;
  paymentsRepo.findByProviderRef = repoStubs.findByProviderRef;
  emailProvider.sendEmail = repoStubs.sendEmail;
});

test('validateMessage rejects empty string', () => {
  assert.throws(() => validateMessage(''), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'VALIDATION_ERROR');
    return true;
  });
});

test('validateMessage rejects whitespace-only', () => {
  assert.throws(() => validateMessage('   '), (err) => err instanceof ApiError);
});

test('validateMessage rejects fewer than 5 characters', () => {
  assert.throws(() => validateMessage('ahoj'), (err) => {
    assert.equal(err.message, 'Správa musí mať aspoň 5 znakov.');
    return true;
  });
});

test('validateMessage rejects more than 2000 characters', () => {
  assert.throws(() => validateMessage('x'.repeat(2001)), (err) => {
    assert.match(err.message, /2000/);
    return true;
  });
});

test('validateMessage accepts a normal message', () => {
  assert.equal(validateMessage('  Potrebujem pomoc s platbou.  '), 'Potrebujem pomoc s platbou.');
});

test('validatePhone accepts null and empty as optional', () => {
  assert.equal(validatePhone(null), null);
  assert.equal(validatePhone(''), null);
  assert.equal(validatePhone('   '), null);
});

test('validatePhone accepts common formats', () => {
  assert.equal(validatePhone('+421 901 234 567'), '+421 901 234 567');
  assert.equal(validatePhone('0901-234-567'), '0901-234-567');
  assert.equal(validatePhone('(0901) 234 567'), '(0901) 234 567');
});

test('validatePhone rejects invalid characters', () => {
  assert.throws(() => validatePhone('call-me'), (err) => {
    assert.equal(err.message, 'Telefón obsahuje nepovolené znaky.');
    return true;
  });
});

test('validateCheckoutSessionId accepts null and empty', () => {
  assert.equal(validateCheckoutSessionId(null), null);
  assert.equal(validateCheckoutSessionId(''), null);
});

test('validateCheckoutSessionId accepts cs_ prefixed values', () => {
  assert.equal(validateCheckoutSessionId('cs_test_abc123'), 'cs_test_abc123');
});

test('validateCheckoutSessionId rejects other prefixes', () => {
  assert.throws(() => validateCheckoutSessionId('pi_abc123'), (err) => {
    assert.equal(err.message, 'Neplatný identifikátor platby.');
    return true;
  });
});

test('buildSupportEmailSubject without reservationId', () => {
  assert.equal(buildSupportEmailSubject(null), 'Podpora – potvrdenie rezervácie');
});

test('buildSupportEmailSubject with reservationId', () => {
  assert.equal(buildSupportEmailSubject('42'), 'Podpora – potvrdenie rezervácie [42]');
});

test('buildSupportEmailHtml renders message as paragraphs and phone as plain text', () => {
  const html = buildSupportEmailHtml({
    message: 'Riadok jedna\n\nRiadok dva',
    phone: '+421 901 234 567',
    reservationId: null,
    reservationIdUnverified: null,
    checkoutSessionId: null,
    context: null,
    recipientMasked: null,
  });

  assert.match(html, /Správa od používateľa/);
  assert.match(html, /<p style="margin:0 0 12px;">Riadok jedna<\/p>/);
  assert.match(html, /Riadok dva/);
  assert.match(html, /Telefón/);
  assert.match(html, /\+421 901 234 567/);
  assert.doesNotMatch(html, /<p style="margin:0 0 12px;">\+421/);
});

test('buildSupportEmailHtml labels unverified reservation id', () => {
  const html = buildSupportEmailHtml({
    message: 'Potrebujem pomoc.',
    phone: null,
    reservationId: null,
    reservationIdUnverified: '99999',
    checkoutSessionId: null,
    context: null,
    recipientMasked: null,
  });

  assert.match(html, /ID rezervácie \(neoverené\)/);
  assert.match(html, /99999/);
  assert.doesNotMatch(html, />ID rezervácie<\/td>/);
});

test('resolveReservationIdForEmail returns verified id when reservation exists', async () => {
  reservationsRepo.getById = async (id) => (id === 42 ? { id: 42 } : null);

  const result = await resolveReservationIdForEmail('42');

  assert.deepEqual(result, { verified: '42', unverified: null });
});

test('resolveReservationIdForEmail drops numeric id when reservation does not exist', async () => {
  reservationsRepo.getById = async () => null;

  const result = await resolveReservationIdForEmail('99');

  assert.deepEqual(result, { verified: null, unverified: null });
});

test('resolveReservationIdForEmail labels non-numeric id as unverified without repo lookup', async () => {
  let called = false;
  reservationsRepo.getById = async () => {
    called = true;
    return { id: 1 };
  };

  const result = await resolveReservationIdForEmail('abc');

  assert.deepEqual(result, { verified: null, unverified: 'abc' });
  assert.equal(called, false);
});

test('resolveReservationIdForEmail falls back to unverified when repo lookup throws', async () => {
  reservationsRepo.getById = async () => {
    throw new Error('connection timeout');
  };

  const result = await resolveReservationIdForEmail('7');

  assert.deepEqual(result, { verified: null, unverified: '7' });
});

test('resolveCheckoutSessionIdForEmail returns id when payment exists', async () => {
  const sessionId = 'cs_test_abc123';
  paymentsRepo.findByProviderRef = async (ref) => (ref === sessionId ? { id: 1 } : null);

  const result = await resolveCheckoutSessionIdForEmail(sessionId);

  assert.equal(result, sessionId);
});

test('resolveCheckoutSessionIdForEmail returns null when payment not found', async () => {
  paymentsRepo.findByProviderRef = async () => null;

  const result = await resolveCheckoutSessionIdForEmail('cs_test_missing');

  assert.equal(result, null);
});

test('resolveCheckoutSessionIdForEmail returns null for invalid format without repo lookup', async () => {
  let called = false;
  paymentsRepo.findByProviderRef = async () => {
    called = true;
    return { id: 1 };
  };

  const result = await resolveCheckoutSessionIdForEmail('pi_abc123');

  assert.equal(result, null);
  assert.equal(called, false);
});

test('resolveCheckoutSessionIdForEmail returns null when repo lookup throws', async () => {
  paymentsRepo.findByProviderRef = async () => {
    throw new Error('Database not configured');
  };

  const result = await resolveCheckoutSessionIdForEmail('cs_test_err');

  assert.equal(result, null);
});

test('sendSupportContact still sends email when reservation lookup throws', async () => {
  let sendCalled = false;
  reservationsRepo.getById = async () => {
    throw new Error('connection timeout');
  };
  emailProvider.sendEmail = async () => {
    sendCalled = true;
    return { ok: true };
  };

  const result = await sendSupportContact({
    message: 'Potrebujem pomoc s platbou.',
    reservationId: '12',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(sendCalled, true);
});

test('sendSupportContact still sends email when checkout session lookup throws', async () => {
  let sendCalled = false;
  paymentsRepo.findByProviderRef = async () => {
    throw new Error('Database not configured');
  };
  emailProvider.sendEmail = async () => {
    sendCalled = true;
    return { ok: true };
  };

  const result = await sendSupportContact({
    message: 'Potrebujem pomoc s platbou.',
    checkoutSessionId: 'cs_test_abc123',
  });

  assert.deepEqual(result, { ok: true });
  assert.equal(sendCalled, true);
});
