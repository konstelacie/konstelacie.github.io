const test = require('node:test');
const assert = require('node:assert/strict');

function withEnv(overrides, fn) {
  const saved = {};
  for (const key of Object.keys(overrides)) {
    saved[key] = process.env[key];
    const val = overrides[key];
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  try {
    fn();
  } finally {
    for (const key of Object.keys(overrides)) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function loadModules() {
  delete require.cache[require.resolve('../src/config/pageVisibility')];
  delete require.cache[require.resolve('../src/config/paymentBackend')];
  return {
    pageVisibility: require('../src/config/pageVisibility'),
    paymentBackend: require('../src/config/paymentBackend'),
  };
}

test('stripe and kros config resolve per backend suffix', () => {
  withEnv(
    {
      STRIPE_SECRET_KEY_TEST: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET_TEST: 'whsec_test',
      STRIPE_SECRET_KEY_PROD: 'sk_live_y',
      KROS_SEQUENCE_PREFIX_TEST: 'T',
      KROS_SEQUENCE_PREFIX_PROD: '',
    },
    () => {
      const { paymentBackend } = loadModules();
      assert.equal(paymentBackend.stripeConfig('test').secretKey, 'sk_test_x');
      assert.equal(paymentBackend.stripeConfig('prod').secretKey, 'sk_live_y');
      assert.equal(paymentBackend.krosSequencePrefix('test'), 'T');
      assert.equal(paymentBackend.krosSequencePrefix('prod'), '');
    }
  );
});

test('backend follows page visibility modes', () => {
  withEnv(
    {
      SITE_HOME_MODE: 'prod',
      FUNNEL_PILOT_MODE: 'test',
      STRIPE_SECRET_KEY_TEST: 'sk_test',
      STRIPE_SECRET_KEY_PROD: 'sk_live',
    },
    () => {
      const { paymentBackend } = loadModules();
      assert.equal(paymentBackend.backendForHomeBooking(), 'prod');
      assert.equal(paymentBackend.backendForFunnel('pilot'), 'test');
      assert.equal(paymentBackend.backendForFunnelName('site'), 'prod');
      assert.equal(paymentBackend.backendForFunnelName('pilot'), 'test');
    }
  );
});

test('backendFromStripeLivemode maps livemode flag', () => {
  const { paymentBackend } = loadModules();
  assert.equal(paymentBackend.backendFromStripeLivemode(true), 'prod');
  assert.equal(paymentBackend.backendFromStripeLivemode(false), 'test');
});
