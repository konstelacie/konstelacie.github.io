const test = require('node:test');
const assert = require('node:assert/strict');

function withEnv(overrides, fn) {
  const keys = [
    'BOOKING_SESSION_MIN_EUR',
    'BOOKING_SESSION_FULL_EUR',
    'FUNNEL_PILOT_DEPOSIT_EUR',
    'FUNNEL_MANIPULACIA_DEPOSIT_EUR',
    ...Object.keys(overrides),
  ];
  const saved = {};
  for (const key of keys) {
    saved[key] = process.env[key];
  }
  for (const key of keys) {
    delete process.env[key];
  }
  for (const [key, val] of Object.entries(overrides)) {
    if (val === undefined) delete process.env[key];
    else process.env[key] = val;
  }
  try {
    fn();
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

function loadBookingCheckoutAmounts() {
  delete require.cache[require.resolve('../src/lib/bookingCheckoutAmounts')];
  delete require.cache[require.resolve('../src/lib/sessionPricing')];
  return require('../src/lib/bookingCheckoutAmounts');
}

test('defaults: site deposit equals min; full payment 85', () => {
  withEnv({}, () => {
    const amounts = loadBookingCheckoutAmounts();
    assert.equal(amounts.MIN_SESSION_TOTAL_EUR, 45);
    assert.equal(amounts.FULL_PAYMENT_CHECKOUT_EUR, 85);
    assert.equal(amounts.reservationDepositEurForFunnel('site'), 45);
    assert.equal(amounts.reservationDepositEurForFunnel('pilot'), 45);
  });
});

test('env overrides min, full, and per-funnel deposit', () => {
  withEnv(
    {
      BOOKING_SESSION_MIN_EUR: '50',
      BOOKING_SESSION_FULL_EUR: '90',
      FUNNEL_PILOT_DEPOSIT_EUR: '12',
    },
    () => {
      const amounts = loadBookingCheckoutAmounts();
      assert.equal(amounts.MIN_SESSION_TOTAL_EUR, 50);
      assert.equal(amounts.FULL_PAYMENT_CHECKOUT_EUR, 90);
      assert.equal(amounts.reservationDepositEurForFunnel('site'), 50);
      assert.equal(amounts.reservationDepositEurForFunnel('pilot'), 12);
      assert.equal(amounts.reservationDepositEurForFunnel('manipulacia'), 50);
    }
  );
});

test('funnel deposit env key matches FUNNEL_*_MODE naming', () => {
  withEnv({}, () => {
    const amounts = loadBookingCheckoutAmounts();
    assert.equal(amounts.funnelDepositEnvKey('pilot'), 'FUNNEL_PILOT_DEPOSIT_EUR');
    assert.equal(amounts.funnelDepositEnvKey('manipulacia'), 'FUNNEL_MANIPULACIA_DEPOSIT_EUR');
  });
});
