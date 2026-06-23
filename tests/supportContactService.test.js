const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiError } = require('../src/middleware/apiError');
const {
  validateMessage,
  validatePhone,
  validateCheckoutSessionId,
  buildSupportEmailSubject,
  buildSupportEmailHtml,
} = require('../src/services/supportContactService');

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
