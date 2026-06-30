const test = require('node:test');
const assert = require('node:assert/strict');

const {
  validateLegalReturnUrl,
  resolveLegalBackHref,
  legalFromQueryString,
} = require('../src/lib/legalBackHref');

test('validateLegalReturnUrl accepts internal paths and rejects legal / external paths', () => {
  assert.equal(validateLegalReturnUrl('/pilot#booking'), '/pilot#booking');
  assert.equal(validateLegalReturnUrl('/success?session_id=abc'), '/success?session_id=abc');
  assert.equal(validateLegalReturnUrl('//evil.example/phish'), null);
  assert.equal(validateLegalReturnUrl('/ochrana-udajov'), null);
  assert.equal(validateLegalReturnUrl('/obchodne-podmienky'), null);
  assert.equal(validateLegalReturnUrl('/../admin'), null);
});

test('resolveLegalBackHref prefers validated from query, then same-origin referer, then home', () => {
  assert.equal(
    resolveLegalBackHref({
      query: { from: '/pilot#booking' },
      get(name) {
        if (name === 'Referer') return 'https://citimtedasom.sk/';
        if (name === 'host') return 'citimtedasom.sk';
        return undefined;
      },
    }),
    '/pilot#booking'
  );

  assert.equal(
    resolveLegalBackHref({
      query: {},
      get(name) {
        if (name === 'Referer') return 'https://citimtedasom.sk/pilot-test';
        if (name === 'host') return 'citimtedasom.sk';
        return undefined;
      },
    }),
    '/pilot-test'
  );

  assert.equal(
    resolveLegalBackHref({
      query: {},
      get(name) {
        if (name === 'Referer') return 'https://google.com/';
        if (name === 'host') return 'citimtedasom.sk';
        return undefined;
      },
    }),
    '/'
  );
});

test('legalFromQueryString encodes from parameter', () => {
  assert.equal(legalFromQueryString('/pilot#booking'), '?from=%2Fpilot%23booking');
  assert.equal(legalFromQueryString(null), '');
});
